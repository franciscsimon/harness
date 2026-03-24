// ─── Code Quality Tool Registry ──────────────────────────────────
// Maps programming languages to their canonical fmt/vet/lint/test tools.
// Inspired by Go's built-in toolchain: every language has equivalents,
// but they're scattered across different packages and configs.
//
// This registry answers: "Given a codebase in language X, what tools
// should I install and run to enforce code quality?"

export interface QualityTool {
  name: string;
  role: "fmt" | "lint" | "vet" | "test" | "typecheck" | "all-in-one";
  install: string; // shell command to install
  check: string; // shell command to check (non-destructive)
  fix: string; // shell command to auto-fix
  config?: string; // default config filename
  description: string;
}

export interface LanguageToolchain {
  language: string;
  extensions: string[];
  manifestFiles: string[]; // package.json, Cargo.toml, go.mod, etc.
  tools: QualityTool[];
  notes?: string;
}

export const REGISTRY: LanguageToolchain[] = [
  // ─── TypeScript / JavaScript ────────────────────────────────────
  {
    language: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    manifestFiles: ["package.json", "tsconfig.json", "deno.json", "bun.lockb"],
    tools: [
      {
        name: "biome",
        role: "all-in-one",
        install: "npm install --save-dev --save-exact @biomejs/biome && npx biome init",
        check: "npx biome check .",
        fix: "npx biome check --write .",
        config: "biome.json",
        description: "Format + lint + import sorting. Replaces ESLint + Prettier. 25x faster.",
      },
      {
        name: "tsc",
        role: "typecheck",
        install: "npm install --save-dev typescript",
        check: "npx tsc --noEmit",
        fix: "npx tsc --noEmit",
        config: "tsconfig.json",
        description: "TypeScript compiler type checking. Catches type errors the linter cannot.",
      },
    ],
    notes:
      "Biome v2.4+ replaces ESLint+Prettier. For legacy projects already on ESLint, run `npx biome migrate eslint`.",
  },

  // ─── Go ─────────────────────────────────────────────────────────
  {
    language: "go",
    extensions: [".go"],
    manifestFiles: ["go.mod", "go.sum"],
    tools: [
      {
        name: "gofmt",
        role: "fmt",
        install: "# built-in with Go",
        check: "gofmt -l .",
        fix: "gofmt -w .",
        description: "Canonical Go formatter. Zero config. One true style.",
      },
      {
        name: "go vet",
        role: "vet",
        install: "# built-in with Go",
        check: "go vet ./...",
        fix: "go vet ./...",
        description: "Detects suspicious constructs the compiler misses.",
      },
      {
        name: "golangci-lint",
        role: "lint",
        install: "go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest",
        check: "golangci-lint run ./...",
        fix: "golangci-lint run --fix ./...",
        config: ".golangci.yml",
        description: "Meta-linter: 50+ linters in parallel. errcheck, staticcheck, revive, gosec.",
      },
      {
        name: "go test",
        role: "test",
        install: "# built-in with Go",
        check: "go test -race ./...",
        fix: "go test -race ./...",
        description: "Built-in test runner with race detector.",
      },
    ],
    notes:
      "Go has the best built-in toolchain. gofmt + vet + test ship with the language. golangci-lint is the only external tool needed.",
  },

  // ─── Rust ───────────────────────────────────────────────────────
  {
    language: "rust",
    extensions: [".rs"],
    manifestFiles: ["Cargo.toml", "Cargo.lock"],
    tools: [
      {
        name: "rustfmt",
        role: "fmt",
        install: "rustup component add rustfmt",
        check: "cargo fmt -- --check",
        fix: "cargo fmt",
        config: "rustfmt.toml",
        description: "Canonical Rust formatter. Shipped with rustup.",
      },
      {
        name: "clippy",
        role: "lint",
        install: "rustup component add clippy",
        check: "cargo clippy -- -D warnings",
        fix: "cargo clippy --fix --allow-dirty",
        description: "The Rust linter. Catches common mistakes, suggests idiomatic code.",
      },
      {
        name: "cargo test",
        role: "test",
        install: "# built-in with Cargo",
        check: "cargo test",
        fix: "cargo test",
        description: "Built-in test runner.",
      },
    ],
    notes: "Rust ships fmt + clippy + test with the toolchain. No external tools needed for most projects.",
  },

  // ─── Python ─────────────────────────────────────────────────────
  {
    language: "python",
    extensions: [".py", ".pyi"],
    manifestFiles: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock", "uv.lock"],
    tools: [
      {
        name: "ruff",
        role: "all-in-one",
        install: "pip install ruff",
        check: "ruff check . && ruff format --check .",
        fix: "ruff check --fix . && ruff format .",
        config: "pyproject.toml",
        description: "Format + lint. Replaces black + isort + flake8 + pylint. 100x faster. Written in Rust.",
      },
      {
        name: "mypy",
        role: "typecheck",
        install: "pip install mypy",
        check: "mypy .",
        fix: "mypy .",
        config: "pyproject.toml",
        description: "Static type checker for Python. Catches type errors in typed Python code.",
      },
      {
        name: "pytest",
        role: "test",
        install: "pip install pytest",
        check: "pytest",
        fix: "pytest",
        config: "pyproject.toml",
        description: "Standard Python test runner.",
      },
    ],
    notes:
      "Ruff is the Biome of Python — replaces 5+ tools with one Rust binary. Use ruff over black/flake8/pylint for new projects.",
  },

  // ─── Java ───────────────────────────────────────────────────────
  {
    language: "java",
    extensions: [".java"],
    manifestFiles: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle"],
    tools: [
      {
        name: "google-java-format",
        role: "fmt",
        install: "# Download from https://github.com/google/google-java-format/releases",
        check: "google-java-format --dry-run --set-exit-if-changed **/*.java",
        fix: "google-java-format --replace **/*.java",
        description: "Google's canonical Java formatter. Zero config.",
      },
      {
        name: "checkstyle",
        role: "lint",
        install: "# Usually configured via Maven/Gradle plugin",
        check: "mvn checkstyle:check || gradle checkstyleMain",
        fix: "# No auto-fix — manual resolution required",
        config: "checkstyle.xml",
        description: "Style and convention checker. Use Google or Sun style.",
      },
      {
        name: "spotbugs",
        role: "vet",
        install: "# Usually configured via Maven/Gradle plugin",
        check: "mvn spotbugs:check || gradle spotbugsMain",
        fix: "# No auto-fix — manual resolution required",
        description: "Finds bug patterns via static analysis. Successor to FindBugs.",
      },
    ],
    notes: "Java tooling is typically integrated via build system plugins (Maven/Gradle), not standalone binaries.",
  },

  // ─── Kotlin ─────────────────────────────────────────────────────
  {
    language: "kotlin",
    extensions: [".kt", ".kts"],
    manifestFiles: ["build.gradle.kts", "build.gradle"],
    tools: [
      {
        name: "ktlint",
        role: "all-in-one",
        install:
          "brew install ktlint || curl -sSLO https://github.com/pinterest/ktlint/releases/latest/download/ktlint && chmod +x ktlint",
        check: "ktlint",
        fix: "ktlint --format",
        config: ".editorconfig",
        description: "Kotlin linter and formatter. Enforces official Kotlin style guide.",
      },
      {
        name: "detekt",
        role: "lint",
        install: "# Usually configured via Gradle plugin",
        check: "gradle detekt",
        fix: "# Limited auto-fix via --auto-correct",
        config: "detekt.yml",
        description: "Static analysis for Kotlin. Catches code smells and complexity issues.",
      },
    ],
  },

  // ─── C / C++ ────────────────────────────────────────────────────
  {
    language: "c-cpp",
    extensions: [".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"],
    manifestFiles: ["CMakeLists.txt", "Makefile", "meson.build", "configure.ac"],
    tools: [
      {
        name: "clang-format",
        role: "fmt",
        install: "apt install clang-format || brew install clang-format",
        check: "find . -name '*.cpp' -o -name '*.h' | xargs clang-format --dry-run --Werror",
        fix: "find . -name '*.cpp' -o -name '*.h' | xargs clang-format -i",
        config: ".clang-format",
        description: "Canonical C/C++ formatter. Supports Google, LLVM, Mozilla, WebKit styles.",
      },
      {
        name: "clang-tidy",
        role: "lint",
        install: "apt install clang-tidy || brew install llvm",
        check: "clang-tidy src/*.cpp -- -std=c++17",
        fix: "clang-tidy --fix src/*.cpp -- -std=c++17",
        config: ".clang-tidy",
        description: "C/C++ linter and static analyzer. Part of LLVM/Clang toolchain.",
      },
      {
        name: "cppcheck",
        role: "vet",
        install: "apt install cppcheck || brew install cppcheck",
        check: "cppcheck --enable=all --error-exitcode=1 src/",
        fix: "# No auto-fix — manual resolution required",
        description: "Static analysis for C/C++. Finds undefined behavior, memory leaks, style issues.",
      },
    ],
  },

  // ─── C# ─────────────────────────────────────────────────────────
  {
    language: "csharp",
    extensions: [".cs"],
    manifestFiles: ["*.csproj", "*.sln", "Directory.Build.props"],
    tools: [
      {
        name: "dotnet format",
        role: "fmt",
        install: "# built-in with .NET SDK 6+",
        check: "dotnet format --verify-no-changes",
        fix: "dotnet format",
        config: ".editorconfig",
        description: "Built-in .NET formatter. Uses .editorconfig for style rules.",
      },
      {
        name: "dotnet analyzers",
        role: "lint",
        install: "# built-in with .NET SDK — enable in .csproj",
        check: "dotnet build /p:TreatWarningsAsErrors=true",
        fix: "dotnet format analyzers",
        description: "Roslyn analyzers. Enable via <EnableNETAnalyzers>true</EnableNETAnalyzers> in .csproj.",
      },
    ],
    notes: "C# has excellent built-in tooling via the .NET SDK. dotnet format + analyzers cover fmt + lint.",
  },

  // ─── Ruby ───────────────────────────────────────────────────────
  {
    language: "ruby",
    extensions: [".rb", ".rake"],
    manifestFiles: ["Gemfile", "Gemfile.lock", "*.gemspec"],
    tools: [
      {
        name: "rubocop",
        role: "all-in-one",
        install: "gem install rubocop",
        check: "rubocop",
        fix: "rubocop --autocorrect",
        config: ".rubocop.yml",
        description: "Ruby formatter + linter. Enforces the Ruby Style Guide.",
      },
    ],
  },

  // ─── PHP ────────────────────────────────────────────────────────
  {
    language: "php",
    extensions: [".php"],
    manifestFiles: ["composer.json", "composer.lock"],
    tools: [
      {
        name: "php-cs-fixer",
        role: "fmt",
        install: "composer require --dev friendsofphp/php-cs-fixer",
        check: "vendor/bin/php-cs-fixer fix --dry-run --diff",
        fix: "vendor/bin/php-cs-fixer fix",
        config: ".php-cs-fixer.php",
        description: "PHP formatter. Enforces PSR-12 or custom rules.",
      },
      {
        name: "phpstan",
        role: "typecheck",
        install: "composer require --dev phpstan/phpstan",
        check: "vendor/bin/phpstan analyse src/",
        fix: "# No auto-fix — manual resolution required",
        config: "phpstan.neon",
        description: "Static type checker for PHP. Like mypy for Python.",
      },
    ],
  },

  // ─── Swift ──────────────────────────────────────────────────────
  {
    language: "swift",
    extensions: [".swift"],
    manifestFiles: ["Package.swift", "*.xcodeproj", "*.xcworkspace"],
    tools: [
      {
        name: "swift-format",
        role: "fmt",
        install: "brew install swift-format || swift package init && swift build",
        check: "swift-format lint --recursive .",
        fix: "swift-format format --recursive --in-place .",
        config: ".swift-format",
        description: "Official Swift formatter by Apple.",
      },
      {
        name: "swiftlint",
        role: "lint",
        install: "brew install swiftlint",
        check: "swiftlint lint",
        fix: "swiftlint lint --fix",
        config: ".swiftlint.yml",
        description: "Swift style and convention linter.",
      },
    ],
  },

  // ─── Elixir ─────────────────────────────────────────────────────
  {
    language: "elixir",
    extensions: [".ex", ".exs"],
    manifestFiles: ["mix.exs", "mix.lock"],
    tools: [
      {
        name: "mix format",
        role: "fmt",
        install: "# built-in with Elixir",
        check: "mix format --check-formatted",
        fix: "mix format",
        config: ".formatter.exs",
        description: "Built-in Elixir formatter. Zero config needed.",
      },
      {
        name: "credo",
        role: "lint",
        install: '# Add {:credo, "~> 1.7", only: [:dev, :test]} to mix.exs deps',
        check: "mix credo --strict",
        fix: "# No auto-fix — manual resolution required",
        config: ".credo.exs",
        description: "Static analysis for Elixir. Focuses on code consistency and teaching.",
      },
      {
        name: "dialyzer",
        role: "typecheck",
        install: '# Add {:dialyxir, "~> 1.4", only: [:dev, :test]} to mix.exs deps',
        check: "mix dialyzer",
        fix: "mix dialyzer",
        description: "Erlang/Elixir type checker. Uses success typing. Catches type mismatches.",
      },
    ],
    notes: "Elixir has Go-like built-in tooling. mix format is zero-config like gofmt.",
  },

  // ─── Zig ────────────────────────────────────────────────────────
  {
    language: "zig",
    extensions: [".zig"],
    manifestFiles: ["build.zig", "build.zig.zon"],
    tools: [
      {
        name: "zig fmt",
        role: "fmt",
        install: "# built-in with Zig",
        check: "zig fmt --check .",
        fix: "zig fmt .",
        description: "Built-in Zig formatter. Like gofmt — canonical, zero config.",
      },
    ],
    notes: "Zig ships its formatter built-in. No external linting tools have matured yet.",
  },

  // ─── Shell / Bash ───────────────────────────────────────────────
  {
    language: "shell",
    extensions: [".sh", ".bash", ".zsh"],
    manifestFiles: [],
    tools: [
      {
        name: "shellcheck",
        role: "lint",
        install: "apt install shellcheck || brew install shellcheck",
        check: "shellcheck **/*.sh",
        fix: "# No auto-fix — manual resolution required",
        description: "Shell script linter. Catches quoting issues, undefined vars, POSIX portability.",
      },
      {
        name: "shfmt",
        role: "fmt",
        install: "go install mvdan.cc/sh/v3/cmd/shfmt@latest || brew install shfmt",
        check: "shfmt -d .",
        fix: "shfmt -w .",
        config: ".editorconfig",
        description: "Shell script formatter. Supports POSIX, bash, mksh.",
      },
    ],
  },

  // ─── SQL ────────────────────────────────────────────────────────
  {
    language: "sql",
    extensions: [".sql"],
    manifestFiles: [],
    tools: [
      {
        name: "sqlfluff",
        role: "all-in-one",
        install: "pip install sqlfluff",
        check: "sqlfluff lint .",
        fix: "sqlfluff fix .",
        config: ".sqlfluff",
        description: "SQL linter and formatter. Supports PostgreSQL, MySQL, SQLite, BigQuery, etc.",
      },
    ],
  },

  // ─── Terraform / HCL ───────────────────────────────────────────
  {
    language: "terraform",
    extensions: [".tf", ".tfvars"],
    manifestFiles: ["*.tf", ".terraform.lock.hcl"],
    tools: [
      {
        name: "terraform fmt",
        role: "fmt",
        install: "# built-in with Terraform CLI",
        check: "terraform fmt -check -recursive",
        fix: "terraform fmt -recursive",
        description: "Built-in Terraform formatter.",
      },
      {
        name: "tflint",
        role: "lint",
        install:
          "brew install tflint || curl -s https://raw.githubusercontent.com/terraform-linters/tflint/master/install_linux.sh | bash",
        check: "tflint --recursive",
        fix: "tflint --fix",
        config: ".tflint.hcl",
        description: "Terraform linter. Catches deprecated syntax, invalid references, provider issues.",
      },
    ],
  },

  // ─── Dockerfile ─────────────────────────────────────────────────
  {
    language: "dockerfile",
    extensions: ["Dockerfile"],
    manifestFiles: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
    tools: [
      {
        name: "hadolint",
        role: "lint",
        install: "brew install hadolint || docker pull hadolint/hadolint",
        check: "hadolint Dockerfile",
        fix: "# No auto-fix — manual resolution required",
        config: ".hadolint.yaml",
        description: "Dockerfile linter. Checks best practices, pinned versions, multi-stage patterns.",
      },
    ],
  },

  // ─── YAML ───────────────────────────────────────────────────────
  {
    language: "yaml",
    extensions: [".yml", ".yaml"],
    manifestFiles: [],
    tools: [
      {
        name: "yamllint",
        role: "lint",
        install: "pip install yamllint",
        check: "yamllint .",
        fix: "# No auto-fix — manual resolution required",
        config: ".yamllint.yml",
        description: "YAML linter. Checks syntax, indentation, key ordering, line length.",
      },
    ],
  },

  // ─── Markdown ───────────────────────────────────────────────────
  {
    language: "markdown",
    extensions: [".md"],
    manifestFiles: [],
    tools: [
      {
        name: "markdownlint",
        role: "lint",
        install: "npm install -g markdownlint-cli",
        check: "markdownlint '**/*.md'",
        fix: "markdownlint --fix '**/*.md'",
        config: ".markdownlint.json",
        description: "Markdown linter. Checks heading style, line length, list formatting.",
      },
    ],
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────

export function findByExtension(ext: string): LanguageToolchain | undefined {
  return REGISTRY.find((tc) => tc.extensions.some((e) => ext.endsWith(e) || ext === e));
}

export function findByManifest(filename: string): LanguageToolchain | undefined {
  return REGISTRY.find((tc) =>
    tc.manifestFiles.some((m) => {
      if (m.startsWith("*")) return filename.endsWith(m.slice(1));
      return filename === m;
    }),
  );
}

export function findByLanguage(lang: string): LanguageToolchain | undefined {
  return REGISTRY.find((tc) => tc.language === lang.toLowerCase());
}
