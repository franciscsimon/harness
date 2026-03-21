// ─── Graph Page ────────────────────────────────────────────────
// Interactive call graph visualization + SPARQL query explorer.
// Uses D3.js force-directed layout for the graph, fetches data
// via the /api/sparql proxy to QLever.

import { layout } from "../components/layout.ts";
import { sparqlQuery } from "../lib/api.ts";
import { escapeHtml } from "../lib/format.ts";

// Pre-built queries for the UI
const CANNED_QUERIES: Record<string, { label: string; icon: string; desc: string; query: string }> = {
  modules: {
    label: "Module Dependencies",
    icon: "📦",
    desc: "Which files import which — the full module dependency graph",
    query: `PREFIX schema: <https://schema.org/>
PREFIX code: <https://pi.dev/code/>
SELECT ?from ?fromName ?to ?toName WHERE {
  ?from a schema:SoftwareSourceCode ;
        schema:name ?fromName ;
        schema:requires ?to .
  ?to schema:name ?toName .
}`,
  },
  hotspots: {
    label: "Function Call Hotspots",
    icon: "🔥",
    desc: "Most-called functions ranked by caller count — find the bottlenecks",
    query: `PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>
SELECT ?name ?file (COUNT(?caller) AS ?callCount) WHERE {
  ?caller code:calls ?fn .
  ?fn schema:name ?name ;
      code:filePath ?file .
}
GROUP BY ?name ?file
ORDER BY DESC(?callCount)
LIMIT 30`,
  },
  calls: {
    label: "Function Call Graph",
    icon: "🕸️",
    desc: "Caller → callee edges between functions with interactive visualization",
    query: `PREFIX code: <https://pi.dev/code/>
PREFIX schema: <https://schema.org/>
SELECT ?callerName ?callerFile ?calleeName ?calleeFile WHERE {
  ?caller code:calls ?callee ;
          schema:name ?callerName ;
          code:filePath ?callerFile .
  ?callee schema:name ?calleeName ;
          code:filePath ?calleeFile .
}
LIMIT 200`,
  },
  types: {
    label: "All Entity Types",
    icon: "🏷️",
    desc: "Count of every RDF type in the graph — code, decisions, projects, errors",
    query: `SELECT ?type (COUNT(?s) AS ?count) WHERE {
  ?s a ?type .
}
GROUP BY ?type
ORDER BY DESC(?count)`,
  },
  decisions: {
    label: "Decisions by Outcome",
    icon: "📋",
    desc: "Design decisions with their outcomes — success, failure, or deferred",
    query: `PREFIX ev: <https://pi.dev/events/>
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT ?task ?outcome WHERE {
  ?d a prov:Activity ;
     ev:task ?task ;
     ev:outcome ?outcome .
}
ORDER BY ?outcome`,
  },
  projects: {
    label: "Projects",
    icon: "📁",
    desc: "All tracked projects from the DOAP registry",
    query: `PREFIX doap: <http://usefulinc.com/ns/doap#>
PREFIX ev: <https://pi.dev/events/>
SELECT ?project ?name WHERE {
  ?project a doap:Project ;
           doap:name ?name .
}`,
  },
};

export async function renderGraph(queryKey?: string, customQuery?: string): Promise<string> {
  const activeQuery = customQuery || (queryKey && CANNED_QUERIES[queryKey]?.query) || CANNED_QUERIES.modules.query;
  const activeKey = customQuery ? "" : (queryKey || "modules");

  // Execute the SPARQL query server-side
  let result: any = null;
  let error: string | null = null;
  try {
    result = await sparqlQuery(activeQuery);
  } catch (e) {
    error = (e as Error).message;
  }

  // Build results table
  let resultsHtml = "";
  if (error) {
    resultsHtml = `<div class="card" style="border-color:#da3633"><p style="color:#da3633">⚠ ${escapeHtml(error)}</p></div>`;
  } else if (result?.results?.bindings?.length > 0) {
    const vars = result.head.vars as string[];
    const rows = result.results.bindings as any[];
    const headerCells = vars.map((v: string) => `<th>${escapeHtml(v)}</th>`).join("");
    const bodyRows = rows.map((row: any) => {
      const cells = vars.map((v: string) => {
        const cell = row[v];
        if (!cell) return "<td>—</td>";
        let val = cell.value;
        // Shorten URIs for readability
        val = val.replace("https://pi.dev/code/", "code:");
        val = val.replace("https://pi.dev/events/", "ev:");
        val = val.replace("https://schema.org/", "schema:");
        val = val.replace("http://www.w3.org/ns/prov#", "prov:");
        val = val.replace("http://usefulinc.com/ns/doap#", "doap:");
        val = val.replace("urn:pi:mod:", "");
        val = val.replace("urn:pi:fn:", "");
        return `<td>${escapeHtml(val)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("\n");
    resultsHtml = `
      <div class="card" style="overflow-x:auto">
        <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:0.5rem">${rows.length} results (${result.meta?.["query-time-ms"] ?? "?"}ms)</p>
        <table class="data-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
  } else {
    resultsHtml = `<div class="card"><p class="empty-state">No results</p></div>`;
  }

  // Build graph data for D3 (only for module/call queries)
  let graphJson = "null";
  if (result?.results?.bindings?.length > 0 && (activeKey === "modules" || activeKey === "calls")) {
    const nodes = new Map<string, { id: string; label: string; group: string }>();
    const links: { source: string; target: string }[] = [];
    const vars = result.head.vars as string[];

    if (activeKey === "modules") {
      for (const row of result.results.bindings) {
        const from = row.from?.value ?? "";
        const to = row.to?.value ?? "";
        const fromLabel = row.fromName?.value ?? from.split("/").pop() ?? from;
        const toLabel = row.toName?.value ?? to.split("/").pop() ?? to;
        if (!nodes.has(from)) nodes.set(from, { id: from, label: fromLabel, group: from.split("/")[0] ?? "" });
        if (!nodes.has(to)) nodes.set(to, { id: to, label: toLabel, group: to.split("/")[0] ?? "" });
        links.push({ source: from, target: to });
      }
    } else if (activeKey === "calls") {
      for (const row of result.results.bindings) {
        const callerFile = row.callerFile?.value ?? "";
        const calleeFile = row.calleeFile?.value ?? "";
        const callerName = row.callerName?.value ?? "";
        const calleeName = row.calleeName?.value ?? "";
        const callerId = `${callerFile}#${callerName}`;
        const calleeId = `${calleeFile}#${calleeName}`;
        if (!nodes.has(callerId)) nodes.set(callerId, { id: callerId, label: callerName, group: callerFile.split("/")[0] ?? "" });
        if (!nodes.has(calleeId)) nodes.set(calleeId, { id: calleeId, label: calleeName, group: calleeFile.split("/")[0] ?? "" });
        links.push({ source: callerId, target: calleeId });
      }
    }

    graphJson = JSON.stringify({ nodes: [...nodes.values()], links });
  }

  // Canned query cards
  const queryCards = Object.entries(CANNED_QUERIES)
    .map(([key, { label, icon, desc }]) => {
      const isActive = key === activeKey;
      return `<a href="/graph?q=${key}" class="sparql-query-card${isActive ? " sparql-query-active" : ""}">
        <span class="sparql-query-icon">${icon}</span>
        <span class="sparql-query-label">${label}</span>
        <span class="sparql-query-desc">${desc}</span>
      </a>`;
    })
    .join("\n");

  const content = `
    <div class="page-header">
      <h1>🕸️ Knowledge Graph</h1>
      <p>SPARQL-powered exploration of code structure, decisions, and project data</p>
    </div>

    <div class="sparql-query-grid">
      ${queryCards}
    </div>

    <div class="section">
      <h2>SPARQL Query</h2>
      <form method="GET" action="/graph">
        <textarea name="sparql" rows="6" style="width:100%;font-family:monospace;font-size:0.85rem;background:var(--bg-secondary);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:0.75rem;resize:vertical">${escapeHtml(activeQuery)}</textarea>
        <button type="submit" class="filter-chip active" style="margin-top:0.5rem;cursor:pointer">Run Query</button>
      </form>
    </div>

    ${(activeKey === "modules" || activeKey === "calls") && graphJson !== "null" ? `
    <div class="section">
      <h2>Graph Visualization</h2>
      <div class="card" id="graph-container" style="height:500px;position:relative;overflow:hidden"></div>
    </div>
    ` : ""}

    <div class="section">
      <h2>Results</h2>
      ${resultsHtml}
    </div>

    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script>
    (function() {
      const data = ${graphJson};
      if (!data || !document.getElementById("graph-container")) return;

      const container = document.getElementById("graph-container");
      const width = container.clientWidth;
      const height = container.clientHeight || 500;

      const svg = d3.select("#graph-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

      // Color by group (directory)
      const groups = [...new Set(data.nodes.map(n => n.group))];
      const color = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

      const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(80))
        .force("charge", d3.forceManyBody().strength(-200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(20));

      // Arrow marker
      svg.append("defs").append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", "#555")
        .attr("d", "M0,-5L10,0L0,5");

      const link = svg.append("g")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("stroke", "#444")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", 1)
        .attr("marker-end", "url(#arrow)");

      const node = svg.append("g")
        .selectAll("circle")
        .data(data.nodes)
        .join("circle")
        .attr("r", 6)
        .attr("fill", d => color(d.group))
        .attr("stroke", "#222")
        .attr("stroke-width", 1)
        .call(d3.drag()
          .on("start", (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on("end", (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
        );

      const label = svg.append("g")
        .selectAll("text")
        .data(data.nodes)
        .join("text")
        .text(d => d.label)
        .attr("font-size", "9px")
        .attr("fill", "#aaa")
        .attr("dx", 10)
        .attr("dy", 3);

      // Tooltip
      node.append("title").text(d => d.id);

      simulation.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        node
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
        label
          .attr("x", d => d.x)
          .attr("y", d => d.y);
      });

      // Zoom
      svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.2, 5])
        .on("zoom", (e) => {
          svg.selectAll("g").attr("transform", e.transform);
        })
      );
    })();
    </script>
  `;

  return layout(content, { title: "Graph", activePath: "/graph" });
}
