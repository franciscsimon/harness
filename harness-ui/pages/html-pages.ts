/**
 * Cat 3 — All HTML page route handlers.
 * Each page is a minimal HTML shell that loads data from JSON APIs.
 * Uses shared layout.js for navigation.
 */
import type { Context } from "hono";

function page(title: string, bodyHtml: string, scripts: string[] = []): string {
  const scriptTags = ["/static/layout.js", ...scripts].map((s) => `<script src="${s}"></script>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Harness</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { margin-bottom: 16px; color: #f0f6fc; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
    th { background: #161b22; color: #8b949e; font-size: 12px; text-transform: uppercase; }
    tr:hover { background: #161b22; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; margin: 8px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .badge-green { background: #238636; color: #fff; }
    .badge-red { background: #da3633; color: #fff; }
    .badge-yellow { background: #d29922; color: #fff; }
    .badge-blue { background: #1f6feb; color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
    canvas { max-width: 100%; background: #161b22; border-radius: 6px; padding: 8px; }
    #kanban-board { display: flex; gap: 12px; overflow-x: auto; }
    .kanban-column { min-width: 220px; background: #161b22; border-radius: 6px; padding: 12px; }
    .kanban-column h3 { font-size: 14px; color: #8b949e; margin-bottom: 8px; text-transform: capitalize; }
    .kanban-card { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 8px; margin: 6px 0; cursor: grab; }
    .kanban-card:hover { border-color: #58a6ff; }
    .priority-critical .card-title { color: #f85149; }
    .priority-high .card-title { color: #d29922; }
    .priority-medium .card-title { color: #c9d1d9; }
    .priority-low .card-title { color: #8b949e; }
    #graph-canvas { width: 100%; height: 500px; border: 1px solid #30363d; border-radius: 6px; }
    .timeline-item { display: flex; gap: 12px; padding: 8px 0; border-left: 2px solid #30363d; padding-left: 16px; margin-left: 8px; }
    .timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: #58a6ff; margin-top: 4px; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="container">${bodyHtml}</div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  ${scriptTags}
</body>
</html>`;
}

// ── Monitoring ──────────────────────────────────────────────────

export function healthPage(_c: Context) {
  return new Response(page("Health", `
    <h1>🩺 Service Health</h1>
    <div class="grid" id="health-grid"></div>
    <script>
      fetch('/api/health').then(r=>r.json()).then(data=>{
        const grid=document.getElementById('health-grid');
        const services=Array.isArray(data)?data:data.services??[];
        if(services.length===0){grid.innerHTML='<p>No health data. Start services first.</p>';return;}
        for(const s of services){
          const cls=s.status==='up'?'badge-green':s.status==='degraded'?'badge-yellow':'badge-red';
          grid.innerHTML+=\`<div class="card"><h3>\${s.service??s.name??'unknown'}</h3><span class="badge \${cls}">\${s.status??'unknown'}</span><p style="margin-top:8px;color:#8b949e">\${s.latencyMs??'?'}ms</p></div>\`;
        }
      }).catch(()=>{document.getElementById('health-grid').innerHTML='<p>Failed to load health data</p>';});
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function errorsPage(_c: Context) {
  return new Response(page("Errors", `
    <h1>🐛 Error Groups</h1>
    <table><thead><tr><th>Fingerprint</th><th>Component</th><th>Count</th><th>Status</th><th>Last Seen</th></tr></thead><tbody id="error-body"></tbody></table>
    <script>
      fetch('/api/quality/errors').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('error-body');
        for(const r of rows){
          body.innerHTML+=\`<tr><td>\${r.fingerprint??r._id}</td><td>\${r.component??''}</td><td>\${r.occurrence_count??1}</td><td><span class="badge badge-\${r.status==='resolved'?'green':'red'}">\${r.status}</span></td><td>\${new Date(Number(r.last_seen??r.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function metricsPage(_c: Context) {
  return new Response(page("Metrics", `
    <h1>📊 API Metrics</h1>
    <canvas id="latency-chart" height="300"></canvas>
    <script>
      fetch('/api/metrics').then(r=>r.json()).then(data=>{
        const ctx=document.getElementById('latency-chart')?.getContext('2d');
        if(!ctx)return;
        const labels=Object.keys(data.endpoints??data).slice(0,10);
        const values=labels.map(k=>(data.endpoints??data)[k]?.p95??0);
        new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'P95 Latency (ms)',data:values,backgroundColor:'#58a6ff'}]},options:{responsive:true}});
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

// ── Security ────────────────────────────────────────────────────

export function scansPage(_c: Context) {
  return new Response(page("Image Scans", `
    <h1>🔍 Image Scan Results</h1>
    <table><thead><tr><th>Image</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Passed</th><th>Date</th></tr></thead><tbody id="scan-body"></tbody></table>
    <script>
      fetch('/api/quality/reviews').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('scan-body');
        for(const r of rows){
          body.innerHTML+=\`<tr><td>\${r.repo??r.image??''}</td><td>\${r.critical_count??0}</td><td>\${r.high_count??0}</td><td>\${r.medium_count??0}</td><td>\${r.low_count??0}</td><td><span class="badge badge-\${r.overall_passed?'green':'red'}">\${r.overall_passed?'Yes':'No'}</span></td><td>\${new Date(Number(r.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function leaksPage(_c: Context) {
  return new Response(page("Leak Detections", `
    <h1>🔐 Log Leak Detections</h1>
    <table><thead><tr><th>Pattern</th><th>Source</th><th>Line</th><th>Snippet</th><th>Date</th></tr></thead><tbody id="leak-body"></tbody></table>
    <script>
      fetch('/api/security/leaks').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('leak-body');
        if(!Array.isArray(rows)){body.innerHTML='<tr><td colspan=5>No data</td></tr>';return;}
        for(const r of rows){
          body.innerHTML+=\`<tr><td>\${r.pattern_name??''}</td><td>\${r.source??''}</td><td>\${r.line_number??''}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">\${r.snippet??''}</td><td>\${new Date(Number(r.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function auditPage(_c: Context) {
  return new Response(page("Dependency Audit", `
    <h1>📦 Dependency Audit</h1>
    <table><thead><tr><th>Package</th><th>Severity</th><th>Title</th><th>Fixable</th><th>Date</th></tr></thead><tbody id="audit-body"></tbody></table>
    <script>
      fetch('/api/security/audit').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('audit-body');
        if(!Array.isArray(rows)){body.innerHTML='<tr><td colspan=5>No data</td></tr>';return;}
        for(const r of rows){
          const cls=r.severity==='critical'?'badge-red':r.severity==='high'?'badge-yellow':'badge-blue';
          body.innerHTML+=\`<tr><td>\${r.package_name}</td><td><span class="badge \${cls}">\${r.severity}</span></td><td>\${r.title??''}</td><td>\${r.fixable?'✅':'❌'}</td><td>\${new Date(Number(r.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

// ── Quality ─────────────────────────────────────────────────────

export function complexityPage(_c: Context) {
  return new Response(page("Complexity", `
    <h1>🧮 Code Complexity Trends</h1>
    <canvas id="complexity-chart" height="300"></canvas>
    <script>
      fetch('/api/quality/complexity').then(r=>r.json()).then(rows=>{
        const ctx=document.getElementById('complexity-chart')?.getContext('2d');
        if(!ctx||!Array.isArray(rows))return;
        const labels=rows.slice(-30).map(r=>new Date(Number(r.ts)).toLocaleDateString());
        const data=rows.slice(-30).map(r=>r.score??r.avg_complexity??0);
        new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Complexity Score',data,borderColor:'#f0883e',tension:0.3}]},options:{responsive:true}});
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function reviewsPage(_c: Context) {
  return new Response(page("Reviews", `
    <h1>📝 Review History</h1>
    <table><thead><tr><th>Repo</th><th>Commit</th><th>Security</th><th>Style</th><th>Complexity</th><th>Overall</th><th>Date</th></tr></thead><tbody id="review-body"></tbody></table>
    <script>
      fetch('/api/quality/reviews').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('review-body');
        for(const r of rows){
          const badge=(v)=>\`<span class="badge badge-\${v?'green':'red'}">\${v?'Pass':'Fail'}</span>\`;
          body.innerHTML+=\`<tr><td>\${r.repo}</td><td>\${(r.commit_hash??'').slice(0,8)}</td><td>\${badge(r.security_passed)}</td><td>\${badge(r.style_passed)}</td><td>\${badge(r.complexity_passed)}</td><td>\${badge(r.overall_passed)}</td><td>\${new Date(Number(r.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

// ── Tickets ─────────────────────────────────────────────────────

export function ticketsPage(_c: Context) {
  return new Response(page("Tickets", `
    <h1>🎫 Ticket Board</h1>
    <div style="margin-bottom:16px">
      <form id="create-form" style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="title" placeholder="Title" required style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:6px 10px;border-radius:4px">
        <input name="project_id" placeholder="Project ID" required style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:6px 10px;border-radius:4px">
        <select name="priority" style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:6px;border-radius:4px"><option>low</option><option selected>medium</option><option>high</option><option>critical</option></select>
        <button type="submit" style="background:#238636;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer">Create</button>
      </form>
    </div>
    <div id="kanban-board"></div>
  `, ["/static/tickets.js"]), { headers: { "content-type": "text/html" } });
}

export function ticketDetailPage(c: Context) {
  const id = c.req.param("id");
  return new Response(page(`Ticket ${id}`, `
    <h1>🎫 Ticket Detail</h1>
    <div id="ticket-detail" class="card">Loading...</div>
    <h2 style="margin-top:24px">Activity</h2>
    <div id="ticket-events"></div>
    <h2 style="margin-top:24px">Links</h2>
    <div id="ticket-links"></div>
    <script>
      const id=decodeURIComponent('${encodeURIComponent(id)}');
      fetch('/api/tickets/'+encodeURIComponent(id)).then(r=>r.json()).then(t=>{
        document.getElementById('ticket-detail').innerHTML=\`<h2>\${t.title}</h2><p>\${t.description??''}</p><p>Status: <span class="badge badge-blue">\${t.status}</span> Priority: <span class="badge badge-yellow">\${t.priority}</span></p><p>Project: \${t.project_id} Assignee: \${t.assignee??'unassigned'}</p>\`;
      });
      fetch('/api/tickets/'+encodeURIComponent(id)+'/events').then(r=>r.json()).then(events=>{
        const el=document.getElementById('ticket-events');
        el.innerHTML=events.map(e=>\`<div class="timeline-item"><div class="timeline-dot"></div><div><strong>\${e.event_type}</strong> by \${e.actor} — \${new Date(Number(e.ts)).toLocaleString()}</div></div>\`).join('');
      });
      fetch('/api/tickets/'+encodeURIComponent(id)+'/links').then(r=>r.json()).then(links=>{
        const el=document.getElementById('ticket-links');
        el.innerHTML=links.map(l=>\`<div class="card">\${l.relation}: \${l.target_type} \${l.target_id}</div>\`).join('')||'<p>No links</p>';
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function ticketListPage(_c: Context) {
  return new Response(page("Ticket List", `
    <h1>📋 All Tickets</h1>
    <table><thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Priority</th><th>Project</th><th>Assignee</th><th>Created</th></tr></thead><tbody id="ticket-list"></tbody></table>
    <script>
      fetch('/api/tickets?limit=200').then(r=>r.json()).then(rows=>{
        const body=document.getElementById('ticket-list');
        for(const t of rows){
          body.innerHTML+=\`<tr><td><a href="/tickets/\${encodeURIComponent(t._id)}" style="color:#58a6ff">\${t._id}</a></td><td>\${t.title}</td><td><span class="badge badge-blue">\${t.status}</span></td><td>\${t.priority}</td><td>\${t.project_id}</td><td>\${t.assignee??''}</td><td>\${new Date(Number(t.ts)).toLocaleString()}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function burndownPage(_c: Context) {
  return new Response(page("Burndown", `
    <h1>📉 Burndown Chart</h1>
    <canvas id="burndown-chart" height="300"></canvas>
    <script>
      fetch('/api/tickets/metrics/burndown').then(r=>r.json()).then(data=>{
        const ctx=document.getElementById('burndown-chart')?.getContext('2d');
        if(!ctx)return;
        const created=data.created??[];
        const closed=data.closed??[];
        const labels=created.map(c=>new Date(c.day).toLocaleDateString());
        let cumCreated=0,cumClosed=0;
        const createdData=created.map(c=>(cumCreated+=c.count,cumCreated));
        const closedData=closed.map(c=>(cumClosed+=c.count,cumClosed));
        new Chart(ctx,{type:'line',data:{labels,datasets:[
          {label:'Created (cumulative)',data:createdData,borderColor:'#f85149'},
          {label:'Closed (cumulative)',data:closedData,borderColor:'#3fb950'}
        ]},options:{responsive:true}});
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

// ── Knowledge Graph ─────────────────────────────────────────────

export function graphExplorePage(_c: Context) {
  return new Response(page("Graph Explorer", `
    <h1>🕸️ Knowledge Graph</h1>
    <svg id="graph-canvas"></svg>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script>
      fetch('/api/graph/explore?limit=200').then(r=>r.json()).then(data=>{
        const svg=d3.select('#graph-canvas').attr('width',960).attr('height',500);
        const nodes=data.nodes.map(n=>({id:n.id,type:n.type}));
        const nodeMap=new Map(nodes.map(n=>[n.id,n]));
        const links=data.edges.filter(e=>nodeMap.has(e.source_id)&&nodeMap.has(e.target_id))
          .map(e=>({source:e.source_id,target:e.target_id,relation:e.relation}));
        const sim=d3.forceSimulation(nodes)
          .force('link',d3.forceLink(links).id(d=>d.id).distance(80))
          .force('charge',d3.forceManyBody().strength(-200))
          .force('center',d3.forceCenter(480,250));
        const colors={project:'#3fb950',session:'#58a6ff',error:'#f85149',ticket:'#d29922',file:'#8b949e',ci_run:'#bc8cff'};
        const link=svg.selectAll('line').data(links).join('line').attr('stroke','#30363d');
        const node=svg.selectAll('circle').data(nodes).join('circle').attr('r',6)
          .attr('fill',d=>colors[d.type]??'#8b949e')
          .call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;})
            .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y;}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
        node.append('title').text(d=>\`\${d.type}: \${d.id}\`);
        sim.on('tick',()=>{link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
          node.attr('cx',d=>d.x).attr('cy',d=>d.y);});
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function graphEntityPage(c: Context) {
  const id = c.req.param("id");
  return new Response(page(`Entity ${id}`, `
    <h1>🔍 Entity: ${id}</h1>
    <div id="entity-info" class="card">Loading...</div>
    <h2 style="margin-top:24px">Connections</h2>
    <table><thead><tr><th>Direction</th><th>Relation</th><th>Entity</th><th>Type</th></tr></thead><tbody id="entity-edges"></tbody></table>
    <script>
      const id='${id}';
      fetch('/api/graph/entity/'+encodeURIComponent(id)).then(r=>r.json()).then(data=>{
        document.getElementById('entity-info').innerHTML='<p>Entity ID: '+data.entityId+'</p><p>Connections: '+data.edges.length+'</p>';
        const body=document.getElementById('entity-edges');
        for(const e of data.edges){
          const dir=e.source_id===id?'→':'←';
          const other=e.source_id===id?e.target_id:e.source_id;
          const otherType=e.source_id===id?e.target_type:e.source_type;
          body.innerHTML+=\`<tr><td>\${dir}</td><td>\${e.relation}</td><td><a href="/graph/entity/\${encodeURIComponent(other)}" style="color:#58a6ff">\${other}</a></td><td>\${otherType}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function graphTimelinePage(_c: Context) {
  return new Response(page("Timeline", `
    <h1>⏱️ Activity Timeline</h1>
    <div id="timeline"></div>
    <script>
      fetch('/api/graph/timeline?limit=50').then(r=>r.json()).then(rows=>{
        const el=document.getElementById('timeline');
        if(!Array.isArray(rows)||rows.length===0){el.innerHTML='<p>No activity yet</p>';return;}
        el.innerHTML=rows.map(e=>\`<div class="timeline-item"><div class="timeline-dot"></div><div><strong>\${e.source_type}:\${e.source_id}</strong> <span style="color:#8b949e">\${e.relation}</span> <strong>\${e.target_type}:\${e.target_id}</strong><br><small style="color:#484f58">\${new Date(Number(e.ts)).toLocaleString()}</small></div></div>\`).join('');
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}

export function graphImpactPage(c: Context) {
  const id = c.req.param("id");
  return new Response(page(`Impact: ${id}`, `
    <h1>💥 Impact Analysis</h1>
    <div id="impact-info" class="card">Loading...</div>
    <table><thead><tr><th>Level</th><th>From</th><th>Relation</th><th>To</th></tr></thead><tbody id="impact-edges"></tbody></table>
    <script>
      fetch('/api/graph/impact/${id}?depth=3').then(r=>r.json()).then(data=>{
        document.getElementById('impact-info').innerHTML='<p>Entity: '+data.entityId+'</p><p>Impact radius: '+data.impactRadius+' entities</p><p>Depth: '+data.depth+'</p>';
        const body=document.getElementById('impact-edges');
        for(const e of data.edges){
          body.innerHTML+=\`<tr><td>L\${e.level}</td><td>\${e.source_type}:\${e.source_id}</td><td>\${e.relation}</td><td>\${e.target_type}:\${e.target_id}</td></tr>\`;
        }
      });
    </script>
  `), { headers: { "content-type": "text/html" } });
}
