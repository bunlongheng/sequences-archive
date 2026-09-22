import { describe, it, expect } from "vitest";
import {
  esc,
  guessIconKey,
  assignIconKeys,
  renderIcon,
  detectSequenceType,
  stripFrontmatter,
  parse,
  buildSvg,
  DEFAULT_OPTS,
  DEFAULT_LAYOUT,
  DEFAULT_DIAGRAM_TITLE,
  PAL,
  PAL_MONOKAI,
  LIFELINE_DASH,
  DIAGRAM_TYPES,
  THEMES,
  ICON_NODES,
} from "@/lib/svg-renderer";
import type { Diagram, Opts, Layout } from "@/lib/svg-renderer";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function mkDiagram(code: string): Diagram {
  return parse(code);
}

function minDiagram(): Diagram {
  return parse("sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Hello");
}

// ---------------------------------------------------------------------------
// 1. esc()
// ---------------------------------------------------------------------------
describe("esc", () => {
  it("escapes ampersand", () => {
    expect(esc("a&b")).toBe("a&amp;b");
  });
  it("escapes less-than", () => {
    expect(esc("a<b")).toBe("a&lt;b");
  });
  it("escapes greater-than", () => {
    expect(esc("a>b")).toBe("a&gt;b");
  });
  it('escapes double quote', () => {
    expect(esc('say "hi"')).toBe("say &quot;hi&quot;");
  });
  it("does NOT escape single quote", () => {
    expect(esc("it's")).toBe("it's");
  });
  it("handles combined special chars", () => {
    expect(esc('<a href="x&y">')).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;");
  });
  it("returns empty string unchanged", () => {
    expect(esc("")).toBe("");
  });
  it("returns plain string unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });
  it("escapes multiple ampersands", () => {
    expect(esc("a&b&c")).toBe("a&amp;b&amp;c");
  });
  it("escapes all four chars in one string", () => {
    expect(esc('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });
});

// ---------------------------------------------------------------------------
// 2. guessIconKey()
// ---------------------------------------------------------------------------
describe("guessIconKey", () => {
  it("user: matches 'user'", () => expect(guessIconKey("user")).toBe("user"));
  it("user: matches 'client'", () => expect(guessIconKey("client")).toBe("user"));
  it("user: matches 'person'", () => expect(guessIconKey("person")).toBe("user"));
  it("user: matches 'customer'", () => expect(guessIconKey("customer")).toBe("user"));
  it("user: matches 'visitor'", () => expect(guessIconKey("visitor")).toBe("user"));

  it("bot: matches 'bot'", () => expect(guessIconKey("bot")).toBe("bot"));
  it("bot: matches 'agent'", () => expect(guessIconKey("agent")).toBe("bot"));
  it("bot: matches 'llm'", () => expect(guessIconKey("llm")).toBe("bot"));
  it("bot: matches 'claude'", () => expect(guessIconKey("claude")).toBe("bot"));
  it("bot: matches 'assistant'", () => expect(guessIconKey("assistant")).toBe("bot"));

  it("server: matches 'api'", () => expect(guessIconKey("api")).toBe("server"));
  it("server: matches 'server'", () => expect(guessIconKey("server")).toBe("server"));
  it("server: matches 'backend'", () => expect(guessIconKey("backend")).toBe("server"));
  it("server: matches 'http'", () => expect(guessIconKey("http")).toBe("server"));

  it("database: matches 'database'", () => expect(guessIconKey("database")).toBe("database"));
  it("database: matches 'db'", () => expect(guessIconKey("db")).toBe("database"));
  it("database: matches 'postgres'", () => expect(guessIconKey("postgres")).toBe("database"));
  it("database: matches 'sql'", () => expect(guessIconKey("sql")).toBe("database"));
  it("database: matches 'mongo'", () => expect(guessIconKey("mongo")).toBe("database"));

  it("brain: 'memory' is a brain, not a person (whole words, not substrings)", () => expect(guessIconKey("memory")).toBe("brain"));
  it("brain: 'knowledge' returns brain", () => expect(guessIconKey("knowledge")).toBe("brain"));
  it("whole words: 'shadow' is not a shell, 'email' is not a bot, 'login' is not a log", () => {
    expect(guessIconKey("Closed shadow root")).toBe("layers");
    expect(guessIconKey("email")).toBe("mail");
    expect(guessIconKey("login")).toBe("lock");
  });
  it("user: 'You' is always a person", () => expect(guessIconKey("You")).toBe("user"));
  it("chrome: a browser toolbar gets the chrome icon", () => expect(guessIconKey("Chrome toolbar")).toBe("chrome"));
  it("file-code: a filename gets the file icon", () => {
    expect(guessIconKey("background.js")).toBe("file-code");
    expect(guessIconKey("worker.py")).toBe("file-code");
  });
  it("link: a page gets the link icon", () => expect(guessIconKey("Page (activeTab)")).toBe("link"));
  it("brain: 'context' returns brain", () => expect(guessIconKey("context")).toBe("brain"));

  it("zap: matches 'cache'", () => expect(guessIconKey("cache")).toBe("zap"));
  it("zap: matches 'redis'", () => expect(guessIconKey("redis")).toBe("zap"));

  it("plug: matches 'mcp'", () => expect(guessIconKey("mcp")).toBe("plug"));
  it("plug: matches 'webhook'", () => expect(guessIconKey("webhook")).toBe("plug"));
  it("plug: matches 'connector'", () => expect(guessIconKey("connector")).toBe("plug"));

  it("git-branch: matches 'github'", () => expect(guessIconKey("github")).toBe("git-branch"));
  it("git-branch: matches 'repo'", () => expect(guessIconKey("repo")).toBe("git-branch"));
  it("git-branch: matches 'commit'", () => expect(guessIconKey("commit")).toBe("git-branch"));

  it("globe: matches 'browser'", () => expect(guessIconKey("browser")).toBe("globe"));
  it("globe: matches 'frontend'", () => expect(guessIconKey("frontend")).toBe("globe"));
  it("globe: matches 'react'", () => expect(guessIconKey("react")).toBe("globe"));

  it("settings: matches 'shell'", () => expect(guessIconKey("shell")).toBe("settings"));
  it("settings: matches 'terminal'", () => expect(guessIconKey("terminal")).toBe("settings"));
  it("settings: matches 'cli'", () => expect(guessIconKey("cli")).toBe("settings"));

  it("folder: matches 'file'", () => expect(guessIconKey("file")).toBe("folder"));
  it("folder: matches 'storage'", () => expect(guessIconKey("storage")).toBe("folder"));
  it("folder: matches 's3'", () => expect(guessIconKey("s3")).toBe("folder"));

  it("cloud: matches 'cloud'", () => expect(guessIconKey("cloud")).toBe("cloud"));
  it("cloud: matches 'aws'", () => expect(guessIconKey("aws")).toBe("cloud"));
  it("cloud: matches 'deploy'", () => expect(guessIconKey("deploy")).toBe("cloud"));

  it("mail: matches 'queue'", () => expect(guessIconKey("queue")).toBe("mail"));
  it("mail: matches 'kafka'", () => expect(guessIconKey("kafka")).toBe("mail"));

  it("lock: matches 'auth'", () => expect(guessIconKey("auth")).toBe("lock"));
  it("lock: matches 'oauth'", () => expect(guessIconKey("oauth")).toBe("lock"));
  it("lock: matches 'jwt'", () => expect(guessIconKey("jwt")).toBe("lock"));

  it("key: matches 'key'", () => expect(guessIconKey("privatekey")).toBe("key"));

  it("search: matches 'search'", () => expect(guessIconKey("search")).toBe("search"));
  it("search: matches 'elastic'", () => expect(guessIconKey("elastic")).toBe("search"));

  it("chart-bar: matches 'log'", () => expect(guessIconKey("log")).toBe("chart-bar"));
  it("chart-bar: matches 'monitor'", () => expect(guessIconKey("monitor")).toBe("chart-bar"));
  it("chart-bar: matches 'grafana'", () => expect(guessIconKey("grafana")).toBe("chart-bar"));

  it("credit-card: matches 'pay'", () => expect(guessIconKey("pay")).toBe("credit-card"));
  it("credit-card: matches 'stripe'", () => expect(guessIconKey("stripe")).toBe("credit-card"));
  it("credit-card: matches 'billing'", () => expect(guessIconKey("billing")).toBe("credit-card"));

  it("smartphone: matches 'mobile'", () => expect(guessIconKey("mobile")).toBe("smartphone"));
  it("smartphone: matches 'ios'", () => expect(guessIconKey("ios")).toBe("smartphone"));
  it("smartphone: matches 'android'", () => expect(guessIconKey("android")).toBe("smartphone"));

  it("rocket: matches 'pipeline'", () => expect(guessIconKey("pipeline")).toBe("rocket"));
  it("rocket: matches 'vercel'", () => expect(guessIconKey("vercel")).toBe("rocket"));
  it("rocket: matches 'ci'", () => expect(guessIconKey("ci")).toBe("rocket"));

  it("shield-check: matches 'test'", () => expect(guessIconKey("test")).toBe("shield-check"));
  it("shield-check: matches 'qa'", () => expect(guessIconKey("qa")).toBe("shield-check"));
  it("shield-check: matches 'playwright'", () => expect(guessIconKey("playwright")).toBe("shield-check"));

  it("bell: matches 'notification'", () => expect(guessIconKey("notification")).toBe("bell"));
  it("bell: matches 'alert'", () => expect(guessIconKey("alert")).toBe("bell"));

  it("package: fallback for unknown", () => expect(guessIconKey("randomxyz")).toBe("package"));
  it("package: fallback for empty string", () => expect(guessIconKey("")).toBe("package"));
});

// ---------------------------------------------------------------------------
// 3. renderIcon()
// ---------------------------------------------------------------------------
describe("renderIcon", () => {
  it("starts with <g transform", () => {
    const out = renderIcon("user", 50, 50, 24);
    expect(out).toMatch(/^<g transform=/);
  });
  it("contains the stroke color (default white)", () => {
    const out = renderIcon("user", 50, 50, 24);
    expect(out).toContain('stroke="white"');
  });
  it("uses a custom color when provided", () => {
    const out = renderIcon("user", 50, 50, 24, "#ff0000");
    expect(out).toContain('stroke="#ff0000"');
  });
  it("unknown key falls back to package icon output", () => {
    const unknown = renderIcon("totally_unknown_key_xyz", 50, 50, 24, "red");
    const pkg = renderIcon("package", 50, 50, 24, "red");
    expect(unknown).toBe(pkg);
  });
  it("translate uses correct x offset", () => {
    // translate(x - size/2, y - size/2) => translate(50-12, 50-12) = translate(38.0, 38.0)
    const out = renderIcon("user", 50, 50, 24);
    expect(out).toContain("translate(38.0,38.0)");
  });
  it("contains fill=none", () => {
    const out = renderIcon("server", 100, 100, 20);
    expect(out).toContain('fill="none"');
  });
  it("contains stroke-linecap=round", () => {
    const out = renderIcon("database", 50, 50, 24);
    expect(out).toContain('stroke-linecap="round"');
  });
  it("renders known icon keys without falling back to package", () => {
    const user = renderIcon("user", 50, 50, 24);
    const pkg = renderIcon("package", 50, 50, 24);
    expect(user).not.toBe(pkg);
  });
  it("contains scale in the transform", () => {
    const out = renderIcon("globe", 60, 60, 24);
    expect(out).toMatch(/scale\(/);
  });
});

// ---------------------------------------------------------------------------
// 4. detectSequenceType()
// ---------------------------------------------------------------------------
describe("detectSequenceType", () => {
  it("sequence: sequenceDiagram", () => {
    expect(detectSequenceType("sequenceDiagram\nA->>B: hi")).toBe("sequence");
  });
  it("flowchart: graph TD", () => {
    expect(detectSequenceType("graph TD\nA-->B")).toBe("flowchart");
  });
  it("flowchart: flowchart LR", () => {
    expect(detectSequenceType("flowchart LR\nA-->B")).toBe("flowchart");
  });
  it("class: classDiagram", () => {
    expect(detectSequenceType("classDiagram\nclass Foo")).toBe("class");
  });
  it("er: erDiagram", () => {
    expect(detectSequenceType("erDiagram\nFoo ||--|{ Bar : has")).toBe("er");
  });
  it("state: stateDiagram", () => {
    expect(detectSequenceType("stateDiagram\n[*]-->A")).toBe("state");
  });
  it("state: stateDiagram-v2", () => {
    expect(detectSequenceType("stateDiagram-v2\n[*]-->A")).toBe("state");
  });
  it("gantt: gantt", () => {
    expect(detectSequenceType("gantt\ntitle Project")).toBe("gantt");
  });
  it("pie: pie", () => {
    expect(detectSequenceType('pie\n"A": 30')).toBe("pie");
  });
  it("journey: journey", () => {
    expect(detectSequenceType("journey\ntitle My Journey")).toBe("journey");
  });
  it("git: gitGraph", () => {
    expect(detectSequenceType("gitGraph\ncommit")).toBe("git");
  });
  it("mindmap: mindmap", () => {
    expect(detectSequenceType("mindmap\nroot((Root))")).toBe("mindmap");
  });
  it("timeline: timeline", () => {
    expect(detectSequenceType("timeline\ntitle History")).toBe("timeline");
  });
  it("quadrant: quadrantChart", () => {
    expect(detectSequenceType("quadrantChart\nA")).toBe("quadrant");
  });
  it("xychart: xychart-beta", () => {
    expect(detectSequenceType("xychart-beta\nbar [1,2,3]")).toBe("xychart");
  });
  it("requirement: requirementDiagram", () => {
    expect(detectSequenceType("requirementDiagram\nrequirement R1")).toBe("requirement");
  });
  it("c4: C4Context", () => {
    expect(detectSequenceType("C4Context\nPerson(u, User)")).toBe("c4");
  });
  it("block: block-beta", () => {
    expect(detectSequenceType("block-beta\nA")).toBe("block");
  });
  it("sankey: sankey-beta", () => {
    expect(detectSequenceType("sankey-beta\nA,B,10")).toBe("sankey");
  });
  it("packet: packet-beta", () => {
    expect(detectSequenceType("packet-beta\n0-7: Field")).toBe("packet");
  });
  it("kanban: kanban", () => {
    expect(detectSequenceType("kanban\ntodo[Todo]")).toBe("kanban");
  });
  it("architecture: architecture-beta", () => {
    expect(detectSequenceType("architecture-beta\nservice A")).toBe("architecture");
  });
  it("radar: radar-beta", () => {
    expect(detectSequenceType("radar-beta\naxis A")).toBe("radar");
  });
  it("treemap: treemap", () => {
    expect(detectSequenceType("treemap\nroot")).toBe("treemap");
  });
  it("unknown keyword returns diagram", () => {
    expect(detectSequenceType("unknownKeyword\nfoo")).toBe("diagram");
  });
  it("empty string returns diagram", () => {
    expect(detectSequenceType("")).toBe("diagram");
  });
  it("skips %% comment lines", () => {
    expect(detectSequenceType("%% This is a comment\nsequenceDiagram")).toBe("sequence");
  });
  it("skips title: lines", () => {
    expect(detectSequenceType("title: My Title\nflowchart LR")).toBe("flowchart");
  });
  it("skips accTitle: lines", () => {
    expect(detectSequenceType("accTitle: Accessibility Title\nclassDiagram")).toBe("class");
  });
  it("skips accDescr: lines", () => {
    expect(detectSequenceType("accDescr: Description\nerDiagram")).toBe("er");
  });
  it("strips frontmatter before detecting", () => {
    const code = "---\ntheme: dark\n---\nsequenceDiagram\nA->>B: hi";
    expect(detectSequenceType(code)).toBe("sequence");
  });
  it("strips code fences before detecting", () => {
    const code = "```mermaid\nflowchart LR\nA-->B\n```";
    expect(detectSequenceType(code)).toBe("flowchart");
  });
});

// ---------------------------------------------------------------------------
// 5. stripFrontmatter()
// ---------------------------------------------------------------------------
describe("stripFrontmatter", () => {
  it("removes leading --- frontmatter block", () => {
    const code = "---\ntheme: dark\n---\nsequenceDiagram";
    expect(stripFrontmatter(code)).toBe("sequenceDiagram");
  });
  it("removes surrounding triple-backtick fences", () => {
    const code = "```mermaid\nflowchart LR\n```";
    expect(stripFrontmatter(code)).toContain("flowchart LR");
  });
  it("returns plain code unchanged when no frontmatter or fences", () => {
    const code = "sequenceDiagram\nA->>B: hi";
    expect(stripFrontmatter(code)).toBe("sequenceDiagram\nA->>B: hi");
  });
  it("strips fence without language specifier", () => {
    const code = "```\ngantt\ntitle T\n```";
    expect(stripFrontmatter(code)).toContain("gantt");
  });
  it("returns remaining code after frontmatter stripped", () => {
    const code = "---\nkey: value\n---\nerDiagram\nFoo ||--|{ Bar : has";
    const result = stripFrontmatter(code);
    expect(result).toContain("erDiagram");
    expect(result).not.toContain("key: value");
  });
  it("handles unclosed frontmatter (no closing ---) as plain code", () => {
    const code = "---\ntheme: dark\nsequenceDiagram";
    // No closing ---, returns as-is
    const result = stripFrontmatter(code);
    expect(result).toContain("---");
  });
});

// ---------------------------------------------------------------------------
// 6. parse()
// ---------------------------------------------------------------------------
describe("parse", () => {
  it("empty code returns empty participants array", () => {
    expect(parse("").participants).toHaveLength(0);
  });
  it("whitespace-only code returns empty participants", () => {
    expect(parse("   \n\n  ").participants).toHaveLength(0);
  });
  it("parses participant declarations", () => {
    const d = parse("sequenceDiagram\nparticipant Alice\nparticipant Bob");
    expect(d.participants.map(p => p.id)).toEqual(["Alice", "Bob"]);
  });
  it("parses actor declarations", () => {
    const d = parse("sequenceDiagram\nactor User");
    expect(d.participants[0].id).toBe("User");
  });
  it("parses participant alias (as label)", () => {
    const d = parse("sequenceDiagram\nparticipant A as Alice");
    expect(d.participants[0].label).toBe("Alice");
  });
  it("converts [brackets] in label to (parens)", () => {
    const d = parse("sequenceDiagram\nparticipant A as My [Service]");
    expect(d.participants[0].label).toBe("My (Service)");
  });
  it("strips <br> from label", () => {
    const d = parse("sequenceDiagram\nparticipant A as Line1<br>Line2");
    expect(d.participants[0].label).toBe("Line1 Line2");
  });
  it("parses solid ->> arrow", () => {
    const d = parse("sequenceDiagram\nA->>B: Hello");
    expect(d.messages[0].arrow).toBe("solid");
  });
  it("parses dashed -->> arrow", () => {
    const d = parse("sequenceDiagram\nA-->>B: Reply");
    expect(d.messages[0].arrow).toBe("dashed");
  });
  it("parses solid -> arrow", () => {
    const d = parse("sequenceDiagram\nA->B: Hi");
    expect(d.messages[0].arrow).toBe("solid");
  });
  it("parses dashed --> arrow", () => {
    const d = parse("sequenceDiagram\nA-->B: Bye");
    expect(d.messages[0].arrow).toBe("dashed");
  });
  it("parses title: line", () => {
    const d = parse("sequenceDiagram\ntitle: My Diagram\nA->>B: hi");
    expect(d.title).toBe("My Diagram");
  });
  it("title is undefined when not present", () => {
    const d = parse("sequenceDiagram\nA->>B: hi");
    expect(d.title).toBeUndefined();
  });
  it("numbered message sets displayStep", () => {
    const d = parse("sequenceDiagram\nA->>B: 1. Hello");
    expect(d.messages[0].displayStep).toBe(1);
  });
  it("numbered message text strips the number prefix", () => {
    const d = parse("sequenceDiagram\nA->>B: 1. Hello");
    expect(d.messages[0].text).toBe("Hello");
  });
  it("non-numbered message has no displayStep", () => {
    const d = parse("sequenceDiagram\nA->>B: Hello");
    expect(d.messages[0].displayStep).toBeUndefined();
  });
  it("totalSteps equals message count", () => {
    const d = parse("sequenceDiagram\nA->>B: Hi\nB->>A: Reply");
    expect(d.totalSteps).toBe(2);
  });
  it("totalSteps is 0 for empty code", () => {
    expect(parse("").totalSteps).toBe(0);
  });
  it("parses note over", () => {
    const d = parse("sequenceDiagram\nA->>B: hi\nnote over A: A note");
    expect(d.notes[0].position).toBe("over");
    expect(d.notes[0].text).toBe("A note");
  });
  it("parses note left of", () => {
    const d = parse("sequenceDiagram\nA->>B: hi\nnote left of A: Left note");
    expect(d.notes[0].position).toBe("left");
  });
  it("parses note right of", () => {
    const d = parse("sequenceDiagram\nA->>B: hi\nnote right of A: Right note");
    expect(d.notes[0].position).toBe("right");
  });
  it("messages auto-create participants if not declared", () => {
    const d = parse("sequenceDiagram\nAlice->>Bob: hi");
    expect(d.participants.map(p => p.id)).toContain("Alice");
    expect(d.participants.map(p => p.id)).toContain("Bob");
  });
  it("message from and to are correct", () => {
    const d = parse("sequenceDiagram\nAlice->>Bob: hi");
    expect(d.messages[0].from).toBe("Alice");
    expect(d.messages[0].to).toBe("Bob");
  });
  it("message text is set correctly", () => {
    const d = parse("sequenceDiagram\nA->>B: Test message");
    expect(d.messages[0].text).toBe("Test message");
  });
  it("step increments for each message", () => {
    const d = parse("sequenceDiagram\nA->>B: one\nB->>A: two");
    expect(d.messages[0].step).toBe(1);
    expect(d.messages[1].step).toBe(2);
  });
  it("participants assigned colors from PAL", () => {
    const d = parse("sequenceDiagram\nparticipant A");
    expect(PAL).toContain(d.participants[0].color);
  });
  it("each participant gets unique color from PAL by index", () => {
    const d = parse("sequenceDiagram\nparticipant A\nparticipant B");
    expect(d.participants[0].color).toBe(PAL[0]);
    expect(d.participants[1].color).toBe(PAL[1]);
  });
  it("duplicate participant declarations only add once", () => {
    const d = parse("sequenceDiagram\nparticipant A\nparticipant A\nA->>A: self");
    expect(d.participants.filter(p => p.id === "A")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. buildSvg()
// ---------------------------------------------------------------------------
describe("buildSvg", () => {
  const baseOpts: Opts = { ...DEFAULT_OPTS };
  const baseLayout: Layout = { ...DEFAULT_LAYOUT };

  it("returns empty string for empty participants", () => {
    const d: Diagram = { participants: [], messages: [], notes: [], totalSteps: 0 };
    expect(buildSvg(d, baseOpts, baseLayout)).toBe("");
  });

  it("returns a string starting with <svg for valid diagram", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toMatch(/^<svg /);
  });

  it("contains width= attribute", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain("width=");
  });

  it("contains height= attribute", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain("height=");
  });

  it("contains a viewBox attribute", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain("viewBox=");
  });

  it("contains the default title in aria-label when no title set", () => {
    const d = parse("sequenceDiagram\nA->>B: hi");
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain(`aria-label="${DEFAULT_DIAGRAM_TITLE}"`);
  });

  it("contains the diagram title in <title> element", () => {
    const d = parse("sequenceDiagram\ntitle: My Custom Title\nA->>B: hi");
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain("<title>My Custom Title</title>");
  });

  it("contains aria-label with diagram title", () => {
    const d = parse("sequenceDiagram\ntitle: Test Title\nA->>B: hi");
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain('aria-label="Test Title"');
  });

  it("light theme has white background rect", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, theme: "light" };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).toContain('fill="#ffffff"');
  });

  it("dark theme has dark background rect", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, theme: "dark" };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).toContain('fill="#16161e"');
  });

  it("monokai theme has monokai background rect", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, theme: "monokai" };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).toContain('fill="#2C2B2F"');
  });

  it("iconMode none vs icons produces different output", () => {
    const d = minDiagram();
    const noneOpts = { ...baseOpts, iconMode: "none" as const };
    const iconsOpts = { ...baseOpts, iconMode: "icons" as const };
    const svgNone = buildSvg(d, noneOpts, baseLayout);
    const svgIcons = buildSvg(d, iconsOpts, baseLayout);
    expect(svgNone).not.toBe(svgIcons);
  });

  it("iconMode icons includes icon transform element", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, iconMode: "icons" as const };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).toMatch(/transform="translate/);
  });

  it("iconMode none does not include renderIcon output", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, iconMode: "none" as const };
    const svg = buildSvg(d, opts, baseLayout);
    // icon mode none has no icon-scale transform
    expect(svg).not.toMatch(/scale\([\d.]+\).+stroke-linecap="round"/);
  });

  it("coloredNumbers true includes a <circle element", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, coloredNumbers: true };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).toContain("<circle ");
  });

  it("coloredNumbers false does not include <circle", () => {
    const d = minDiagram();
    const opts = { ...baseOpts, coloredNumbers: false };
    const svg = buildSvg(d, opts, baseLayout);
    expect(svg).not.toContain("<circle ");
  });

  it("fixed createdAt date renders that date in the SVG", () => {
    const d = minDiagram();
    const fixedDate = new Date("2024-01-15T12:00:00Z");
    const svg = buildSvg(d, baseOpts, baseLayout, fixedDate);
    // Date should appear somewhere in the SVG
    expect(svg).toContain("2024");
  });

  it("createdAt as string is also accepted", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout, "2024-06-01T00:00:00Z");
    expect(svg).toContain("2024");
  });

  it("contains BH branding text in output", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain(">BH</tspan>");
  });

  it("svg closes with </svg>", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("contains role=img attribute", () => {
    const d = minDiagram();
    const svg = buildSvg(d, baseOpts, baseLayout);
    expect(svg).toContain('role="img"');
  });

  it("emoji iconMode with emoji label produces different output than none", () => {
    const d = parse("sequenceDiagram\nparticipant A as 🚀 Rocket\nA->>A: go");
    const emojiOpts = { ...baseOpts, iconMode: "emoji" as const };
    const noneOpts = { ...baseOpts, iconMode: "none" as const };
    const svgEmoji = buildSvg(d, emojiOpts, baseLayout);
    const svgNone = buildSvg(d, noneOpts, baseLayout);
    expect(svgEmoji).not.toBe(svgNone);
  });
});

// ---------------------------------------------------------------------------
// 8. Constants and defaults
// ---------------------------------------------------------------------------
describe("PAL", () => {
  it("has length 12", () => {
    expect(PAL).toHaveLength(12);
  });
  it("all entries are hex color strings", () => {
    PAL.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe("PAL_MONOKAI", () => {
  it("has length 10", () => {
    expect(PAL_MONOKAI).toHaveLength(10);
  });
  it("all entries are hex color strings", () => {
    PAL_MONOKAI.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe("DEFAULT_DIAGRAM_TITLE", () => {
  it("equals 'Sequence Diagram'", () => {
    expect(DEFAULT_DIAGRAM_TITLE).toBe("Sequence Diagram");
  });
});

describe("DEFAULT_OPTS", () => {
  it("has coloredLines property", () => {
    expect(DEFAULT_OPTS).toHaveProperty("coloredLines");
  });
  it("has coloredNumbers property", () => {
    expect(DEFAULT_OPTS).toHaveProperty("coloredNumbers");
  });
  it("has theme property", () => {
    expect(DEFAULT_OPTS).toHaveProperty("theme");
  });
  it("theme defaults to light", () => {
    expect(DEFAULT_OPTS.theme).toBe("light");
  });
  it("iconMode defaults to icons", () => {
    expect(DEFAULT_OPTS.iconMode).toBe("icons");
  });
  it("font defaults to Roboto", () => {
    expect(DEFAULT_OPTS.font).toBe("Roboto");
  });
  it("autoLayout defaults to true", () => {
    expect(DEFAULT_OPTS.autoLayout).toBe(true);
  });
});

describe("DEFAULT_LAYOUT", () => {
  it("has stepHeight property", () => {
    expect(DEFAULT_LAYOUT).toHaveProperty("stepHeight");
  });
  it("stepHeight is 34", () => {
    expect(DEFAULT_LAYOUT.stepHeight).toBe(34);
  });
  it("boxWidth is 141", () => {
    expect(DEFAULT_LAYOUT.boxWidth).toBe(141);
  });
  it("spacing is 250", () => {
    expect(DEFAULT_LAYOUT.spacing).toBe(250);
  });
  it("textSize is 13", () => {
    expect(DEFAULT_LAYOUT.textSize).toBe(13);
  });
  it("margin is 80", () => {
    expect(DEFAULT_LAYOUT.margin).toBe(80);
  });
  it("vPad is 0", () => {
    expect(DEFAULT_LAYOUT.vPad).toBe(0);
  });
});

describe("DIAGRAM_TYPES", () => {
  it("graph maps to flowchart", () => {
    expect(DIAGRAM_TYPES["graph"]).toBe("flowchart");
  });
  it("sequencediagram maps to sequence", () => {
    expect(DIAGRAM_TYPES["sequencediagram"]).toBe("sequence");
  });
  it("erdiagram maps to er", () => {
    expect(DIAGRAM_TYPES["erdiagram"]).toBe("er");
  });
  it("classdiagram maps to class", () => {
    expect(DIAGRAM_TYPES["classdiagram"]).toBe("class");
  });
  it("gitgraph maps to git", () => {
    expect(DIAGRAM_TYPES["gitgraph"]).toBe("git");
  });
  it("mindmap maps to mindmap", () => {
    expect(DIAGRAM_TYPES["mindmap"]).toBe("mindmap");
  });
  it("kanban maps to kanban", () => {
    expect(DIAGRAM_TYPES["kanban"]).toBe("kanban");
  });
  it("treemap maps to treemap", () => {
    expect(DIAGRAM_TYPES["treemap"]).toBe("treemap");
  });
});

describe("LIFELINE_DASH", () => {
  it("solid.da is none", () => {
    expect(LIFELINE_DASH.solid.da).toBe("none");
  });
  it("dot entry exists", () => {
    expect(LIFELINE_DASH).toHaveProperty("dot");
  });
  it("small entry exists", () => {
    expect(LIFELINE_DASH).toHaveProperty("small");
  });
  it("long entry exists", () => {
    expect(LIFELINE_DASH).toHaveProperty("long");
  });
});

describe("THEMES", () => {
  it("has light key", () => {
    expect(THEMES).toHaveProperty("light");
  });
  it("has dark key", () => {
    expect(THEMES).toHaveProperty("dark");
  });
  it("has monokai key", () => {
    expect(THEMES).toHaveProperty("monokai");
  });
  it("light.bg is #ffffff", () => {
    expect(THEMES.light.bg).toBe("#ffffff");
  });
  it("dark.bg is #16161e", () => {
    expect(THEMES.dark.bg).toBe("#16161e");
  });
  it("monokai.bg is #2C2B2F", () => {
    expect(THEMES.monokai.bg).toBe("#2C2B2F");
  });
});

describe("ICON_NODES", () => {
  it("has user key", () => {
    expect(ICON_NODES).toHaveProperty("user");
  });
  it("has bot key", () => {
    expect(ICON_NODES).toHaveProperty("bot");
  });
  it("has server key", () => {
    expect(ICON_NODES).toHaveProperty("server");
  });
  it("has database key", () => {
    expect(ICON_NODES).toHaveProperty("database");
  });
  it("has package key", () => {
    expect(ICON_NODES).toHaveProperty("package");
  });
  it("user node is a non-empty array", () => {
    expect(ICON_NODES.user.length).toBeGreaterThan(0);
  });
  it("each ICON_NODES entry is an array of tuples", () => {
    Object.values(ICON_NODES).forEach(nodes => {
      expect(Array.isArray(nodes)).toBe(true);
      nodes.forEach(([tag, props]) => {
        expect(typeof tag).toBe("string");
        expect(typeof props).toBe("object");
      });
    });
  });
});

// ---------------------------------------------------------------------------
// assignIconKeys() - one icon per participant, never a repeat
// ---------------------------------------------------------------------------
describe("assignIconKeys", () => {
  const P = (id: string, label: string) => ({ id, label });

  it("never gives 2 participants the same icon", () => {
    const keys = assignIconKeys([P("Y", "You"), P("T", "Chrome toolbar"), P("B", "background.js"), P("P", "Page (activeTab)"), P("O", "overlay.js"), P("S", "Closed shadow root")]);
    expect(new Set(Object.values(keys)).size).toBe(6);
    expect(keys).toMatchObject({ Y: "user", T: "chrome", B: "file-code", P: "link", O: "code", S: "layers" });
  });

  it("a second file takes its next-best candidate, not a copy", () => {
    const keys = assignIconKeys([P("B", "background.js"), P("O", "overlay.js")]);
    expect(keys.B).toBe("file-code");
    expect(keys.O).toBe("code");
  });

  it("a first choice beats an earlier participant's runner-up", () => {
    // overlay.js would take layers as its fallback; shadow root wants it outright
    const keys = assignIconKeys([P("B", "background.js"), P("O", "overlay.js"), P("S", "Closed shadow root")]);
    expect(keys.S).toBe("layers");
    expect(keys.O).toBe("code");
  });

  it("2 people: the first is the person, the second is something else", () => {
    const keys = assignIconKeys([P("A", "Customer"), P("B", "User")]);
    expect(keys.A).toBe("user");
    expect(keys.B).not.toBe("user");
  });

  it("explicit picks are honored and reserved before any auto pick", () => {
    const keys = assignIconKeys([P("A", "Foo"), P("B", "Bar")], { B: "package" });
    expect(keys.B).toBe("package");
    expect(keys.A).not.toBe("package");
  });

  it("an unrecognized label never falls back to a person or a robot", () => {
    const keys = assignIconKeys(Array.from({ length: 12 }, (_, i) => P(`p${i}`, `Thing ${i}`)));
    expect(Object.values(keys)).not.toContain("user");
    expect(Object.values(keys)).not.toContain("bot");
    expect(new Set(Object.values(keys)).size).toBe(12);
  });
});
