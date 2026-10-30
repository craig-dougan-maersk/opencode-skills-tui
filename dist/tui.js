// @bun
// src/tui.tsx
import { createComponent as _$createComponent3 } from "@opentui/solid";
import { effect as _$effect3 } from "@opentui/solid";
import { insertNode as _$insertNode3 } from "@opentui/solid";
import { insert as _$insert3 } from "@opentui/solid";
import { use as _$use2 } from "@opentui/solid";
import { setProp as _$setProp3 } from "@opentui/solid";
import { createElement as _$createElement3 } from "@opentui/solid";
import { readFileSync } from "fs";
import { CliRenderEvents as CliRenderEvents2, CodeRenderable, InputRenderable, SyntaxStyle, TextAttributes, isRenderable } from "@opentui/core";
import { Show as Show3, createEffect as createEffect2, createMemo as createMemo2, createSignal as createSignal3, onCleanup as onCleanup2 } from "solid-js";
import { useTerminalDimensions as useTerminalDimensions2, useRenderer } from "@opentui/solid";

// src/components/skills-panel.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { For, Show, createMemo, createSignal } from "solid-js";

// src/skill-data.ts
import { posix, win32 } from "path";
var compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
var estimateTokens = (text) => Math.ceil(Buffer.byteLength(text, "utf8") / 4);
var formatTokenCount = (tokens) => compactNumber.format(tokens).toLowerCase();
function renderSkillListing(skill) {
  return [
    "  <skill>",
    `    <id>${skill.id}</id>`,
    `    <name>${skill.name}</name>`,
    `    <description>${skill.description}</description>`,
    "  </skill>"
  ].join(`
`);
}
function estimateSkillListingTotal(skills) {
  const visible = skills.filter((skill) => skill.modelVisible !== false && skill.description !== undefined).sort((a, b) => a.id.localeCompare(b.id));
  if (visible.some((skill) => skill.name === undefined))
    return;
  if (visible.length === 0)
    return 0;
  return estimateTokens([
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    "The user may also invoke a skill directly. When that happens, its instructions appear in the conversation as a <skill_content> block, the same shape the skill tool returns. A skill that is already present this way does not need to be invoked again.",
    "<available_skills>",
    ...visible.map(renderSkillListing),
    "</available_skills>"
  ].join(`
`));
}
var pathFor = (path) => /^(?:[a-z]:[\\/]|\\\\)/i.test(path) ? win32 : posix;
function renderSkillLoad(skill) {
  if (skill.name === undefined || !skill.path)
    return;
  const path = pathFor(skill.path);
  const files = path.basename(skill.path) === "SKILL.md" ? skill.fileSamples : [];
  if (files === undefined)
    return;
  return [
    `<skill_content name="${skill.name}">`,
    `# Skill: ${skill.name}`,
    "",
    skill.content.trim(),
    "",
    `Base directory for this skill: ${path.dirname(skill.path)}`,
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
    "Note: file list is sampled.",
    "",
    "<skill_files>",
    ...files.map((file) => `<file>${file}</file>`),
    "</skill_files>",
    "</skill_content>"
  ].join(`
`);
}
function estimateSkillTokens(skill, mode) {
  if (skill.name === undefined)
    return;
  const listing = skill.modelVisible === false || skill.description === undefined ? 0 : estimateTokens(renderSkillListing(skill));
  if (mode === "listing")
    return listing;
  const output = renderSkillLoad(skill);
  if (output === undefined)
    return;
  const load = estimateTokens(output);
  return mode === "loaded-total" ? listing + load : load;
}
async function loadSkillFileSamples(ctx, skill, location, signal) {
  if (!skill.path || skill.name === undefined)
    return;
  const path = pathFor(skill.path);
  if (path.basename(skill.path) !== "SKILL.md")
    return [];
  const files = [];
  const visit = async (directory) => {
    if (signal?.aborted)
      return;
    const response = await ctx.client.file.list({ location, path: directory }, { signal });
    if (signal?.aborted)
      return;
    const base = response.location.directory ?? location.directory;
    if (!base)
      throw new Error("File sample location is unavailable");
    const entries = response.data.map((entry) => {
      const absolute = path.resolve(base, entry.path);
      const relative = path.relative(directory, absolute);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("File sample escaped its skill directory");
      }
      return { type: entry.type, absolute, key: absolute + (entry.type === "directory" ? path.sep : "") };
    }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    for (const entry of entries) {
      if (signal?.aborted || files.length === 10)
        return;
      if (entry.type === "directory")
        await visit(entry.absolute);
      else if (path.basename(entry.absolute) !== "SKILL.md")
        files.push(entry.absolute);
    }
  };
  await visit(path.dirname(skill.path));
  return signal?.aborted ? undefined : files;
}
async function loadAvailableSkills(ctx, location = ctx.location ?? ctx.data.location.default()) {
  await Promise.all([
    ctx.data.location.skill.sync(location),
    ctx.data.location.agent.sync(location)
  ]);
  return toSummaries(ctx.data.location.skill.list(location) ?? []);
}
function matches(input, pattern) {
  let escaped = pattern.replaceAll("\\", "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  if (escaped.endsWith(" .*"))
    escaped = escaped.slice(0, -3) + "( .*)?";
  return new RegExp(`^${escaped}$`, process.platform === "win32" ? "si" : "s").test(input.replaceAll("\\", "/"));
}
function isModelVisible(entry, id, rules) {
  if (entry.description === undefined || entry.autoinvoke === false)
    return false;
  const permission = rules.find((rule) => matches("skill", rule.action) && matches(id, rule.resource));
  return permission?.effect !== "deny";
}
function toSummaries(skills, permissions = [], loadedIDs, mode = "model") {
  const deduped = new Map;
  const rules = [...permissions].reverse();
  for (const entry of skills) {
    if (typeof entry.id !== "string" || !entry.id)
      continue;
    const id = entry.id;
    const modelVisible = isModelVisible(entry, id, rules);
    if (mode === "loaded" && !loadedIDs?.has(id))
      continue;
    if (mode === "model" && !modelVisible && !loadedIDs?.has(id))
      continue;
    deduped.set(id, deduped.get(id) ?? {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      path: entry.path,
      content: entry.content ?? "",
      modelVisible
    });
  }
  for (const id of loadedIDs ?? []) {
    if (typeof id === "string" && id && !deduped.has(id))
      deduped.set(id, { id, content: "", modelVisible: false });
  }
  return [...deduped.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function sortSkillsByLoaded(skills, loaded) {
  return [...skills].sort((left, right) => Number(loaded.has(right.id)) - Number(loaded.has(left.id)) || Number(left.modelVisible === false) - Number(right.modelVisible === false) || (left.name ?? left.id).localeCompare(right.name ?? right.id) || left.id.localeCompare(right.id));
}
function extractMessageSkillLoads(message) {
  const m = message;
  if (m.type === "assistant" && Array.isArray(m.content)) {
    const ids = [];
    for (const entry of m.content) {
      const s = entry;
      if (s.type !== "tool" || s.name !== "skill" || s.state?.status !== "completed" || typeof s.state.input?.id !== "string" || s.state.input.id.length === 0)
        continue;
      if ((Array.isArray(s.state.content) ? s.state.content : []).some((part) => typeof part?.text === "string" && part.text.startsWith('<skill_content name="')))
        ids.push(s.state.input.id);
    }
    return ids;
  }
  if (m.type === "skill" && typeof m.skill === "string" && m.skill.length > 0) {
    return [m.skill];
  }
  if (m.type === "user" && Array.isArray(m.skills)) {
    return m.skills.map((attachment) => attachment?.id).filter((id) => typeof id === "string" && id.length > 0);
  }
  return [];
}
function extractSkillLoadState(messages) {
  const loaded = new Set;
  let compactionID;
  for (const message of messages) {
    const entry = message;
    if (entry.type === "compaction" && entry.status === "completed") {
      loaded.clear();
      compactionID = entry.id;
    }
    for (const id of extractMessageSkillLoads(message))
      loaded.add(id);
  }
  return { loaded, compactionID };
}
async function backfillLoadedSkills(ctx, sessionID, signal) {
  const loaded = new Set;
  let cursor;
  do {
    if (signal?.aborted)
      return;
    const page = await ctx.client.message.list({
      sessionID,
      limit: 200,
      ...cursor ? { cursor } : { order: "desc" }
    });
    if (signal?.aborted)
      return;
    for (const message of page.data) {
      if (message.type === "compaction" && message.status === "completed") {
        return { loaded, compactionID: message.id };
      }
      for (const id of extractMessageSkillLoads(message))
        loaded.add(id);
    }
    cursor = page.cursor?.next;
  } while (cursor);
  return { loaded };
}

// src/components/skills-panel.tsx
function SkillsPanel(props) {
  const loadedColor = () => props.theme().surface("dialog").background.action.primary.focused;
  const normalColor = () => props.themeMode() === "light" ? "#000000" : "#ffffff";
  const displayedSkills = createMemo(() => {
    const loaded = props.loadedIDs();
    return sortSkillsByLoaded(props.skills(), loaded);
  });
  const loadedCount = createMemo(() => displayedSkills().filter((skill) => props.loadedIDs().has(skill.id)).length);
  const [stateWidth, setStateWidth] = createSignal(0);
  const totalCount = () => props.scope() === "registered" ? props.registeredCount() : props.modelVisibleCount();
  const fullState = () => props.scope() === "loaded" ? `(${loadedCount()} loaded)` : `(${loadedCount()} loaded \xB7 ${totalCount()} ${props.scope() === "registered" ? "registered" : "visible"})`;
  const state = () => fullState().length <= stateWidth() ? fullState() : props.scope() === "loaded" ? `(${loadedCount()})` : `(${loadedCount()}/${totalCount()})`;
  const estimates = createMemo(() => {
    const mode = props.tokenMode();
    return new Map(mode === "off" ? [] : displayedSkills().map((skill) => [skill.id, estimateSkillTokens(skill, mode)]));
  });
  const tokenLabel = (tokens) => tokens === undefined ? "-" : `~${formatTokenCount(tokens)} tok`;
  const totalTokens = createMemo(() => {
    const visible = displayedSkills().filter((skill) => skill.modelVisible);
    const mode = props.tokenMode();
    if (mode === "listing")
      return tokenLabel(estimateSkillListingTotal(visible));
    const counts = visible.map((skill) => mode === "loaded-total" ? estimateSkillTokens(skill, "load-delta") : estimates().get(skill.id));
    if (counts.some((count) => count === undefined))
      return tokenLabel(undefined);
    const load = counts.reduce((sum, count) => sum + count, 0);
    const listing = mode === "loaded-total" ? estimateSkillListingTotal(visible) : 0;
    return tokenLabel(listing === undefined ? undefined : listing + load);
  });
  const tokenWidth = createMemo(() => Math.max(totalTokens().length, ...[...estimates().values()].map((count) => tokenLabel(count).length)));
  return (() => {
    var _el$ = _$createElement("box"), _el$2 = _$createElement("box"), _el$3 = _$createElement("text"), _el$4 = _$createElement("text"), _el$5 = _$createElement("b");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "paddingRight", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$setProp(_el$2, "id", "skills-panel.header");
    _$setProp(_el$2, "width", "100%");
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "gap", 1);
    _$setProp(_el$2, "onMouseUp", (event) => {
      if (event.button !== 0 && event.button !== 2)
        return;
      event.preventDefault();
      event.stopPropagation();
      props.onToggle();
    });
    _$setProp(_el$3, "flexShrink", 0);
    _$insert(_el$3, () => props.collapsed() ? "\u25B6" : "\u25BC");
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "flexShrink", 0);
    _$insertNode(_el$5, _$createTextNode(`Skills`));
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return props.showState();
      },
      get fallback() {
        return (() => {
          var _el$0 = _$createElement("box");
          _$setProp(_el$0, "flexGrow", 1);
          return _el$0;
        })();
      },
      get children() {
        var _el$7 = _$createElement("box"), _el$8 = _$createElement("text");
        _$insertNode(_el$7, _el$8);
        _$setProp(_el$7, "onSizeChange", function() {
          setStateWidth(this.width);
        });
        _$setProp(_el$7, "flexGrow", 1);
        _$setProp(_el$7, "minWidth", 0);
        _$setProp(_el$7, "height", 1);
        _$setProp(_el$7, "flexShrink", 1);
        _$setProp(_el$8, "width", "100%");
        _$setProp(_el$8, "height", 1);
        _$setProp(_el$8, "wrapMode", "none");
        _$setProp(_el$8, "truncate", true);
        _$effect((_p$) => {
          var _v$ = state(), _v$2 = props.theme().text.muted;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$8, "content", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$8, "fg", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$7;
      }
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return props.tokenMode() !== "off";
      },
      get children() {
        var _el$9 = _$createElement("text");
        _$setProp(_el$9, "id", "skills-panel.total-tokens");
        _$setProp(_el$9, "height", 1);
        _$setProp(_el$9, "flexShrink", 0);
        _$setProp(_el$9, "textAlign", "right");
        _$insert(_el$9, totalTokens);
        _$effect((_p$) => {
          var _v$3 = tokenWidth(), _v$4 = props.theme().text.muted;
          _v$3 !== _p$.e && (_p$.e = _$setProp(_el$9, "width", _v$3, _p$.e));
          _v$4 !== _p$.t && (_p$.t = _$setProp(_el$9, "fg", _v$4, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$9;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !props.collapsed();
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return displayedSkills().length > 0;
          },
          get fallback() {
            return (() => {
              var _el$1 = _$createElement("text");
              _$setProp(_el$1, "width", "100%");
              _$setProp(_el$1, "flexShrink", 0);
              _$setProp(_el$1, "wrapMode", "char");
              _$insert(_el$1, () => props.emptyMessage());
              _$effect((_$p) => _$setProp(_el$1, "fg", props.theme().text.muted, _$p));
              return _el$1;
            })();
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return displayedSkills();
              },
              children: (skill) => {
                const loaded = () => props.loadedIDs().has(skill.id);
                const color = () => loaded() ? loadedColor() : skill.modelVisible === false ? props.theme().text.muted : normalColor();
                const onRowMouseUp = (event) => {
                  if (event.button !== 0 && event.button !== 1 && event.button !== 2)
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  props.onSkillClick(skill, event.button);
                };
                return (() => {
                  var _el$10 = _$createElement("box"), _el$11 = _$createElement("text"), _el$13 = _$createElement("text");
                  _$insertNode(_el$10, _el$11);
                  _$insertNode(_el$10, _el$13);
                  _$setProp(_el$10, "width", "100%");
                  _$setProp(_el$10, "flexDirection", "row");
                  _$setProp(_el$10, "columnGap", 1);
                  _$setProp(_el$10, "onMouseUp", onRowMouseUp);
                  _$insertNode(_el$11, _$createTextNode(`\u2022`));
                  _$setProp(_el$11, "flexShrink", 0);
                  _$setProp(_el$13, "flexGrow", 1);
                  _$setProp(_el$13, "minWidth", 0);
                  _$setProp(_el$13, "height", 1);
                  _$setProp(_el$13, "flexShrink", 1);
                  _$setProp(_el$13, "wrapMode", "none");
                  _$setProp(_el$13, "truncate", true);
                  _$insert(_el$13, () => skill.name ?? skill.id);
                  _$insert(_el$10, _$createComponent(Show, {
                    get when() {
                      return props.tokenMode() !== "off";
                    },
                    get children() {
                      var _el$14 = _$createElement("text");
                      _$setProp(_el$14, "height", 1);
                      _$setProp(_el$14, "flexShrink", 0);
                      _$setProp(_el$14, "textAlign", "right");
                      _$insert(_el$14, () => tokenLabel(estimates().get(skill.id)));
                      _$effect((_p$) => {
                        var _v$7 = `skills-panel.${skill.id}.tokens`, _v$8 = tokenWidth(), _v$9 = props.theme().text.muted;
                        _v$7 !== _p$.e && (_p$.e = _$setProp(_el$14, "id", _v$7, _p$.e));
                        _v$8 !== _p$.t && (_p$.t = _$setProp(_el$14, "width", _v$8, _p$.t));
                        _v$9 !== _p$.a && (_p$.a = _$setProp(_el$14, "fg", _v$9, _p$.a));
                        return _p$;
                      }, {
                        e: undefined,
                        t: undefined,
                        a: undefined
                      });
                      return _el$14;
                    }
                  }), null);
                  _$effect((_p$) => {
                    var _v$0 = `skills-panel.${skill.id}`, _v$1 = color(), _v$10 = color();
                    _v$0 !== _p$.e && (_p$.e = _$setProp(_el$10, "id", _v$0, _p$.e));
                    _v$1 !== _p$.t && (_p$.t = _$setProp(_el$11, "fg", _v$1, _p$.t));
                    _v$10 !== _p$.a && (_p$.a = _$setProp(_el$13, "fg", _v$10, _p$.a));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined
                  });
                  return _el$10;
                })();
              }
            });
          }
        });
      }
    }), null);
    _$effect((_p$) => {
      var _v$5 = normalColor(), _v$6 = normalColor();
      _v$5 !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$5, _p$.e));
      _v$6 !== _p$.t && (_p$.t = _$setProp(_el$4, "fg", _v$6, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}

// src/components/skills-dialog.tsx
import { effect as _$effect2 } from "@opentui/solid";
import { memo as _$memo2 } from "@opentui/solid";
import { insert as _$insert2 } from "@opentui/solid";
import { createComponent as _$createComponent2 } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode2 } from "@opentui/solid";
import { insertNode as _$insertNode2 } from "@opentui/solid";
import { setProp as _$setProp2 } from "@opentui/solid";
import { createElement as _$createElement2 } from "@opentui/solid";
import { CliRenderEvents } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { For as For2, Show as Show2, createEffect, createSignal as createSignal2, onCleanup } from "solid-js";
var OPTIONS = [{
  key: "switch",
  label: "Show sidebar",
  category: "Sidebar Display",
  values: ["off", "on"]
}, {
  key: "scope",
  label: "Display scope",
  category: "Sidebar Display",
  values: ["model", "registered", "loaded"],
  labels: ["model-visible", "registered", "loaded-only"]
}, {
  key: "token",
  label: "Token estimation",
  category: "Sidebar Display",
  values: ["listing", "load-delta", "loaded-total", "off"],
  labels: ["list entry", "load cost", "total cost", "off"]
}, {
  key: "state",
  label: "Header counts",
  category: "Sidebar Display",
  values: ["on", "off"]
}, {
  key: "preview",
  label: "Skill overview",
  category: "Mouse actions",
  values: ["left-click", "middle-click", "right-click", "off"]
}, {
  key: "mention",
  label: "Insert @mention",
  category: "Mouse actions",
  values: ["left-click", "middle-click", "right-click", "off"]
}];
function SkillsDialog(props) {
  const dims = useTerminalDimensions();
  const theme = () => props.ctx.theme.surface("dialog");
  const [selected, setSelected] = createSignal2(0);
  const [pending, setPending] = createSignal2({});
  const value = (key) => pending()[key] ?? props.settings()[key];
  const conflict = () => value("preview") !== "off" && value("preview") === value("mention");
  let scroll;
  const move = (delta) => setSelected((index) => (index + delta + OPTIONS.length) % OPTIONS.length);
  const change = (delta, option = OPTIONS[selected()]) => {
    const index = option.values.indexOf(value(option.key));
    const next = option.values[(index + delta + option.values.length) % option.values.length];
    if (option.key === "preview" || option.key === "mention") {
      const other = option.key === "preview" ? "mention" : "preview";
      if (next !== "off" && next === props.settings()[other]) {
        setPending({
          [option.key]: next
        });
        return;
      }
      setPending({});
    }
    props.onChange({
      [option.key]: next
    });
  };
  const close = () => {
    props.ctx.renderer.clearSelection();
    props.ctx.ui.dialog.clear();
  };
  props.ctx.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [{
      bind: "escape",
      run: close
    }, {
      bind: "up,ctrl+p",
      run: () => move(-1)
    }, {
      bind: "down,ctrl+n",
      run: () => move(1)
    }, {
      bind: "home",
      run: () => setSelected(0)
    }, {
      bind: "end",
      run: () => setSelected(OPTIONS.length - 1)
    }, {
      bind: "left",
      run: () => change(-1)
    }, {
      bind: "right,return",
      run: () => change(1)
    }]
  }));
  createEffect(() => {
    const index = selected();
    const option = OPTIONS[index];
    dims().height;
    const reveal = () => {
      if (!scroll || scroll.isDestroyed)
        return;
      if (index === 0)
        scroll.scrollTo(0);
      else
        scroll.scrollChildIntoView(`skills-sider.${option.key}`);
    };
    props.ctx.renderer.once(CliRenderEvents.FRAME, reveal);
    props.ctx.renderer.requestRender();
    onCleanup(() => props.ctx.renderer.off(CliRenderEvents.FRAME, reveal));
  });
  const click = (event, action) => {
    if (event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  return (() => {
    var _el$ = _$createElement2("box"), _el$2 = _$createElement2("box"), _el$3 = _$createElement2("text"), _el$4 = _$createElement2("b"), _el$6 = _$createElement2("text"), _el$8 = _$createElement2("scrollbox"), _el$9 = _$createElement2("box"), _el$0 = _$createElement2("text");
    _$insertNode2(_el$, _el$2);
    _$insertNode2(_el$, _el$8);
    _$insertNode2(_el$, _el$9);
    _$setProp2(_el$, "width", "100%");
    _$setProp2(_el$, "paddingBottom", 1);
    _$insertNode2(_el$2, _el$3);
    _$insertNode2(_el$2, _el$6);
    _$setProp2(_el$2, "flexDirection", "row");
    _$setProp2(_el$2, "paddingX", 4);
    _$setProp2(_el$2, "flexShrink", 0);
    _$insertNode2(_el$3, _el$4);
    _$insertNode2(_el$4, _$createTextNode2(`Skills Sidebar`));
    _$insertNode2(_el$6, _$createTextNode2(`esc`));
    _$setProp2(_el$6, "flexGrow", 1);
    _$setProp2(_el$6, "textAlign", "right");
    _$setProp2(_el$6, "onMouseUp", (event) => click(event, close));
    _$use((value) => {
      scroll = value;
      value.verticalScrollBar.resetVisibilityControl();
      value.horizontalScrollBar.resetVisibilityControl();
    }, _el$8);
    _$setProp2(_el$8, "id", "skills-sider.options");
    _$setProp2(_el$8, "flexGrow", 1);
    _$setProp2(_el$8, "minHeight", 0);
    _$setProp2(_el$8, "width", "100%");
    _$setProp2(_el$8, "paddingX", 1);
    _$setProp2(_el$8, "scrollX", false);
    _$insert2(_el$8, _$createComponent2(For2, {
      each: OPTIONS,
      children: (option, index) => {
        const active = () => selected() === index();
        const invalid = () => conflict() && (option.key === "preview" || option.key === "mention");
        return [_$createComponent2(Show2, {
          get when() {
            return index() === 0 || OPTIONS[index() - 1].category !== option.category;
          },
          get children() {
            var _el$1 = _$createElement2("box"), _el$10 = _$createElement2("text"), _el$11 = _$createElement2("b");
            _$insertNode2(_el$1, _el$10);
            _$setProp2(_el$1, "paddingLeft", 3);
            _$setProp2(_el$1, "flexShrink", 0);
            _$insertNode2(_el$10, _el$11);
            _$insert2(_el$11, () => option.category);
            _$effect2((_p$) => {
              var _v$7 = index() > 0 ? 1 : 0, _v$8 = theme().hue.accent[200];
              _v$7 !== _p$.e && (_p$.e = _$setProp2(_el$1, "paddingTop", _v$7, _p$.e));
              _v$8 !== _p$.t && (_p$.t = _$setProp2(_el$10, "fg", _v$8, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$1;
          }
        }), (() => {
          var _el$12 = _$createElement2("box"), _el$13 = _$createElement2("text"), _el$14 = _$createElement2("text");
          _$insertNode2(_el$12, _el$13);
          _$insertNode2(_el$12, _el$14);
          _$setProp2(_el$12, "width", "100%");
          _$setProp2(_el$12, "flexDirection", "row");
          _$setProp2(_el$12, "columnGap", 1);
          _$setProp2(_el$12, "paddingLeft", 3);
          _$setProp2(_el$12, "paddingRight", 2);
          _$setProp2(_el$12, "height", 1);
          _$setProp2(_el$12, "flexShrink", 0);
          _$setProp2(_el$12, "onMouseMove", () => setSelected(index()));
          _$setProp2(_el$12, "onMouseDown", (event) => click(event, () => setSelected(index())));
          _$setProp2(_el$12, "onMouseUp", (event) => click(event, () => {
            setSelected(index());
            change(1, option);
          }));
          _$setProp2(_el$13, "flexShrink", 0);
          _$insert2(_el$13, () => option.label ?? option.key);
          _$setProp2(_el$14, "flexGrow", 1);
          _$setProp2(_el$14, "minWidth", 0);
          _$setProp2(_el$14, "height", 1);
          _$setProp2(_el$14, "flexShrink", 1);
          _$setProp2(_el$14, "wrapMode", "none");
          _$setProp2(_el$14, "truncate", true);
          _$setProp2(_el$14, "textAlign", "right");
          _$insert2(_el$14, () => (option.labels ?? option.values)[option.values.indexOf(value(option.key))]);
          _$effect2((_p$) => {
            var _v$9 = `skills-sider.${option.key}`, _v$0 = active() ? theme().background.action.primary.focused : undefined, _v$1 = active() ? theme().text.action.primary.focused : theme().text.base, _v$10 = invalid() ? theme().text.feedback.error.base : active() ? theme().text.action.primary.focused : theme().text.muted;
            _v$9 !== _p$.e && (_p$.e = _$setProp2(_el$12, "id", _v$9, _p$.e));
            _v$0 !== _p$.t && (_p$.t = _$setProp2(_el$12, "backgroundColor", _v$0, _p$.t));
            _v$1 !== _p$.a && (_p$.a = _$setProp2(_el$13, "fg", _v$1, _p$.a));
            _v$10 !== _p$.o && (_p$.o = _$setProp2(_el$14, "fg", _v$10, _p$.o));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined
          });
          return _el$12;
        })()];
      }
    }));
    _$insertNode2(_el$9, _el$0);
    _$setProp2(_el$9, "paddingX", 4);
    _$setProp2(_el$9, "flexShrink", 0);
    _$setProp2(_el$0, "width", "100%");
    _$setProp2(_el$0, "height", 1);
    _$setProp2(_el$0, "wrapMode", "none");
    _$setProp2(_el$0, "truncate", true);
    _$insert2(_el$0, () => conflict() ? "Button conflict \xB7 change not saved" : "\u2191/\u2193 select \xB7 \u2190/\u2192 / enter change");
    _$effect2((_p$) => {
      var _v$ = Math.max(1, Math.min(17, dims().height - 4)), _v$2 = dims().height < 12 ? 0 : 1, _v$3 = theme().background.base, _v$4 = theme().text.base, _v$5 = theme().text.muted, _v$6 = conflict() ? theme().text.feedback.error.base : theme().text.muted;
      _v$ !== _p$.e && (_p$.e = _$setProp2(_el$, "height", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp2(_el$, "gap", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp2(_el$, "backgroundColor", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp2(_el$3, "fg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp2(_el$6, "fg", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp2(_el$0, "fg", _v$6, _p$.n));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined
    });
    return _el$;
  })();
}

// src/open-link.ts
import { spawn } from "child_process";
function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}
function resolveLinkToOpen(event, hasSelection, getLinkAt) {
  if (!event.modifiers?.ctrl || hasSelection())
    return null;
  const url = getLinkAt(event.x, event.y);
  return url !== null && isHttpUrl(url) ? url : null;
}
function openUrl(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

// src/tui.tsx
var EMPTY_LOADED_SKILLS = new Set;
var definePlugin = (plugin) => plugin;
var locationKey = (location) => JSON.stringify([location.directory, location.workspaceID]);
function createMarkdownSyntax(theme, owner) {
  const markdown = theme.markdown;
  const bg = theme.surface("dialog").background.base;
  return SyntaxStyle.fromStyles({
    default: {
      fg: markdown.text,
      bg
    },
    "markup.heading": {
      fg: markdown.heading,
      bg,
      bold: true
    },
    "markup.strong": {
      fg: markdown.strong,
      bg,
      bold: true
    },
    "markup.italic": {
      fg: markdown.emphasis,
      bg,
      italic: true
    },
    "markup.list": {
      fg: markdown.listItem,
      bg
    },
    "markup.quote": {
      fg: markdown.blockQuote,
      bg,
      italic: true
    },
    "markup.raw": {
      fg: markdown.code,
      bg
    },
    "markup.link": {
      fg: markdown.link,
      bg,
      underline: true
    },
    "markup.link.url": {
      fg: markdown.link,
      bg,
      underline: true
    },
    "markup.link.label": {
      fg: markdown.linkText,
      bg,
      underline: true
    },
    "markup.strikethrough": {
      fg: theme.text.muted,
      bg,
      dim: true
    }
  }, owner);
}
function updateMarkdownCode(renderable, syntaxStyle) {
  if (renderable instanceof CodeRenderable) {
    renderable.wrapMode = "char";
    renderable.syntaxStyle = syntaxStyle;
  }
  for (const child of renderable.getChildren()) {
    if (isRenderable(child))
      updateMarkdownCode(child, syntaxStyle);
  }
}
function splitFrontmatter(raw) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(raw);
  if (!match)
    return {
      body: raw
    };
  return {
    frontmatter: match[1],
    body: raw.slice(match[0].length)
  };
}
function SkillPreviewDialog(props) {
  const dims = useTerminalDimensions2();
  props.ctx.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [{
      bind: "escape",
      run: () => {
        props.ctx.renderer.clearSelection();
        props.ctx.ui.dialog.clear();
      }
    }]
  }));
  const [separatorWidth, setSeparatorWidth] = createSignal3(0);
  const separator = () => {
    const label = " provided by plugin ";
    const dashes = Math.max(0, separatorWidth() - label.length);
    const right = Math.min(7, Math.floor(dashes / 2));
    return `${"-".repeat(dashes - right)}${label}${"-".repeat(right)}`;
  };
  let markdown;
  const scene = useRenderer();
  const syntaxStyle = createMemo2(() => createMarkdownSyntax(props.theme(), scene.nativeScene));
  createEffect2((previous) => {
    const style = syntaxStyle();
    if (markdown)
      updateMarkdownCode(markdown, style);
    previous?.destroy();
    return style;
  });
  onCleanup2(() => syntaxStyle().destroy());
  const background = () => props.theme().surface("dialog").background.base;
  const onPreviewMouseUp = (event) => {
    const url = resolveLinkToOpen(event, () => props.renderer.getSelection() !== null, props.renderer.getLinkAt);
    if (url === null)
      return;
    event.stopPropagation();
    openUrl(url);
  };
  let content;
  if (props.raw) {
    const {
      frontmatter,
      body
    } = splitFrontmatter(props.raw);
    content = frontmatter ? `${frontmatter}

${body.trim()}
` : props.raw;
  } else if (props.skill.description) {
    content = `> ${props.skill.description}

${props.skill.content}`;
  } else {
    content = props.skill.content;
  }
  const path = props.skill.path;
  const source = path || "-";
  const chars = [...content].length.toLocaleString("en-US");
  const tok = (mode) => {
    const tokens = estimateSkillTokens(props.skill, mode);
    return tokens === undefined ? "-" : `~${formatTokenCount(tokens)} tok`;
  };
  return (() => {
    var _el$ = _$createElement3("box"), _el$2 = _$createElement3("scrollbox"), _el$3 = _$createElement3("text"), _el$4 = _$createElement3("text"), _el$5 = _$createElement3("text"), _el$6 = _$createElement3("box"), _el$7 = _$createElement3("text"), _el$8 = _$createElement3("markdown");
    _$insertNode3(_el$, _el$2);
    _$setProp3(_el$, "flexDirection", "column");
    _$setProp3(_el$, "paddingBottom", 1);
    _$setProp3(_el$, "paddingLeft", 2);
    _$setProp3(_el$, "paddingRight", 2);
    _$setProp3(_el$, "width", "100%");
    _$insertNode3(_el$2, _el$3);
    _$insertNode3(_el$2, _el$4);
    _$insertNode3(_el$2, _el$5);
    _$insertNode3(_el$2, _el$6);
    _$insertNode3(_el$2, _el$8);
    _$use2((scrollbox) => {
      scrollbox.verticalScrollBar.resetVisibilityControl();
      scrollbox.horizontalScrollBar.resetVisibilityControl();
    }, _el$2);
    _$setProp3(_el$2, "width", "100%");
    _$setProp3(_el$2, "flexGrow", 1);
    _$setProp3(_el$2, "minHeight", 0);
    _$setProp3(_el$2, "paddingRight", 1);
    _$setProp3(_el$2, "scrollX", false);
    _$setProp3(_el$3, "width", "100%");
    _$setProp3(_el$3, "flexShrink", 0);
    _$setProp3(_el$3, "wrapMode", "char");
    _$insert3(_el$3, () => `id: ${props.skill.id}`);
    _$setProp3(_el$4, "width", "100%");
    _$setProp3(_el$4, "flexShrink", 0);
    _$setProp3(_el$4, "wrapMode", "char");
    _$insert3(_el$4, () => `stats: chars ${chars} \xB7 list entry ${tok("listing")} \xB7 load cost ${tok("load-delta")} \xB7 total cost ${tok("loaded-total")}`);
    _$setProp3(_el$5, "width", "100%");
    _$setProp3(_el$5, "flexShrink", 0);
    _$setProp3(_el$5, "wrapMode", "char");
    _$insert3(_el$5, `path: ${source}`);
    _$insertNode3(_el$6, _el$7);
    _$setProp3(_el$6, "id", "skills-preview.separator");
    _$setProp3(_el$6, "width", "100%");
    _$setProp3(_el$6, "flexShrink", 0);
    _$setProp3(_el$6, "marginBottom", 1);
    _$setProp3(_el$6, "onSizeChange", function() {
      setSeparatorWidth(this.width);
    });
    _$setProp3(_el$7, "width", "100%");
    _$setProp3(_el$7, "flexShrink", 0);
    _$setProp3(_el$7, "wrapMode", "char");
    _$use2((renderable) => {
      markdown = renderable;
      updateMarkdownCode(renderable, syntaxStyle());
    }, _el$8);
    _$setProp3(_el$8, "width", "100%");
    _$setProp3(_el$8, "content", content);
    _$setProp3(_el$8, "tableOptions", {
      wrapMode: "char"
    });
    _$setProp3(_el$8, "onMouseUp", onPreviewMouseUp);
    _$effect3((_p$) => {
      var _v$ = Math.max(1, dims().height - 4), _v$2 = background(), _v$3 = props.theme().text.muted, _v$4 = background(), _v$5 = TextAttributes.ITALIC, _v$6 = props.theme().text.muted, _v$7 = background(), _v$8 = TextAttributes.ITALIC, _v$9 = props.theme().text.muted, _v$0 = background(), _v$1 = TextAttributes.ITALIC, _v$10 = separator(), _v$11 = props.theme().text.muted, _v$12 = background(), _v$13 = TextAttributes.ITALIC, _v$14 = syntaxStyle(), _v$15 = props.theme().markdown.text, _v$16 = background();
      _v$ !== _p$.e && (_p$.e = _$setProp3(_el$, "height", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp3(_el$, "backgroundColor", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp3(_el$3, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp3(_el$3, "bg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp3(_el$3, "attributes", _v$5, _p$.i));
      _v$6 !== _p$.n && (_p$.n = _$setProp3(_el$4, "fg", _v$6, _p$.n));
      _v$7 !== _p$.s && (_p$.s = _$setProp3(_el$4, "bg", _v$7, _p$.s));
      _v$8 !== _p$.h && (_p$.h = _$setProp3(_el$4, "attributes", _v$8, _p$.h));
      _v$9 !== _p$.r && (_p$.r = _$setProp3(_el$5, "fg", _v$9, _p$.r));
      _v$0 !== _p$.d && (_p$.d = _$setProp3(_el$5, "bg", _v$0, _p$.d));
      _v$1 !== _p$.l && (_p$.l = _$setProp3(_el$5, "attributes", _v$1, _p$.l));
      _v$10 !== _p$.u && (_p$.u = _$setProp3(_el$7, "content", _v$10, _p$.u));
      _v$11 !== _p$.c && (_p$.c = _$setProp3(_el$7, "fg", _v$11, _p$.c));
      _v$12 !== _p$.w && (_p$.w = _$setProp3(_el$7, "bg", _v$12, _p$.w));
      _v$13 !== _p$.m && (_p$.m = _$setProp3(_el$7, "attributes", _v$13, _p$.m));
      _v$14 !== _p$.f && (_p$.f = _$setProp3(_el$8, "syntaxStyle", _v$14, _p$.f));
      _v$15 !== _p$.y && (_p$.y = _$setProp3(_el$8, "fg", _v$15, _p$.y));
      _v$16 !== _p$.g && (_p$.g = _$setProp3(_el$8, "bg", _v$16, _p$.g));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined,
      r: undefined,
      d: undefined,
      l: undefined,
      u: undefined,
      c: undefined,
      w: undefined,
      m: undefined,
      f: undefined,
      y: undefined,
      g: undefined
    });
    return _el$;
  })();
}
var tui_default = definePlugin({
  id: "opencode-skills-tui",
  setup(ctx) {
    const collapsedByDefault = ctx.options?.collapsedByDefault !== false;
    const [ui, mutateUI] = ctx.storage.memory("prefs", {
      initial: {
        collapsed: collapsedByDefault,
        switch: "on",
        scope: "model",
        preview: "left-click",
        mention: "right-click",
        token: "off",
        state: "on"
      }
    });
    const normalizeSettings = (value) => ({
      switch: value.switch ?? "on",
      scope: value.scope ?? value.displayMode ?? "model",
      preview: value.preview ?? "left-click",
      mention: value.mention ?? "right-click",
      token: value.token === "metadata" ? "listing" : value.token === "instructions" ? "load-delta" : value.token ?? "off",
      state: value.state ?? "on"
    });
    const [prefs, mutatePrefs] = ctx.storage.store("settings", {
      initial: normalizeSettings(ui)
    });
    const settings = () => normalizeSettings(prefs);
    const changeSettings = (update) => {
      mutatePrefs((draft) => {
        const next = {
          ...normalizeSettings(draft),
          ...update
        };
        if (next.preview !== "off" && next.preview === next.mention)
          throw new Error("Mouse button conflict");
        Object.assign(draft, next);
      }).catch((error) => {
        if (disposed)
          return;
        ctx.ui.toast.show({
          variant: "error",
          title: "Skills Sidebar",
          message: `Failed to save skills sidebar settings: ${error instanceof Error ? error.message : String(error)}`,
          duration: 5000
        });
      });
    };
    const [loadedBySession, setLoadedBySession] = createSignal3(new Map);
    const [fileSamples, setFileSamples] = createSignal3(new Map);
    const sampling = new Map;
    const backfilled = new Set;
    const backfilling = new Map;
    const [refreshByLocation, setRefreshByLocation] = createSignal3(new Map);
    const compactionBySession = new Map;
    const deletedSessions = new Set;
    let disposed = false;
    let refreshID = 0;
    let initialRefreshTimer;
    let stopNativeSelection;
    const sampleKey = (skill, location) => `${locationKey(location)}\x00${skill.path}`;
    const clearFileSamples = (location) => {
      const prefix = `${locationKey(location)}\x00`;
      for (const [key, controller] of sampling) {
        if (!key.startsWith(prefix))
          continue;
        controller.abort();
        sampling.delete(key);
      }
      setFileSamples((current) => {
        const next = new Map([...current].filter(([key]) => !key.startsWith(prefix)));
        return next.size === current.size ? current : next;
      });
    };
    const ensureFileSamples = (skill, location, refresh = false) => {
      if (disposed || skill.name === undefined || !skill.path || !/(?:^|[\\/])SKILL\.md$/.test(skill.path))
        return;
      const key = sampleKey(skill, location);
      if (sampling.has(key) || !refresh && fileSamples().has(key))
        return;
      const controller = new AbortController;
      sampling.set(key, controller);
      loadSkillFileSamples(ctx, skill, location, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])).catch(() => {
        return;
      }).then((files) => {
        if (disposed || controller.signal.aborted || sampling.get(key) !== controller)
          return;
        setFileSamples((current) => new Map(current).set(key, files));
      }).finally(() => {
        if (sampling.get(key) === controller)
          sampling.delete(key);
      });
    };
    const markLoaded = (sessionID, skillID) => {
      if (disposed || deletedSessions.has(sessionID))
        return;
      setLoadedBySession((current) => {
        const loaded = current.get(sessionID);
        if (loaded?.has(skillID))
          return current;
        const next = new Map(current);
        next.set(sessionID, new Set(loaded).add(skillID));
        return next;
      });
    };
    const resetLoaded = (sessionID) => {
      backfilling.get(sessionID)?.abort();
      backfilling.delete(sessionID);
      backfilled.delete(sessionID);
      setLoadedBySession((current) => {
        if (!current.has(sessionID))
          return current;
        const next = new Map(current);
        next.delete(sessionID);
        return next;
      });
    };
    const applyLoads = (sessionID, state) => {
      if (disposed || deletedSessions.has(sessionID))
        return;
      if (state.compactionID && state.compactionID !== compactionBySession.get(sessionID)) {
        compactionBySession.set(sessionID, state.compactionID);
        resetLoaded(sessionID);
      }
      for (const id of state.loaded)
        markLoaded(sessionID, id);
    };
    const ensureBackfill = (sessionID) => {
      if (disposed || deletedSessions.has(sessionID) || backfilled.has(sessionID) || backfilling.has(sessionID))
        return;
      const controller = new AbortController;
      backfilling.set(sessionID, controller);
      backfillLoadedSkills(ctx, sessionID, controller.signal).then((state) => {
        if (disposed || controller.signal.aborted || !state)
          return;
        backfilling.delete(sessionID);
        applyLoads(sessionID, state);
        applyLoads(sessionID, extractSkillLoadState(ctx.data.session.message.list(sessionID)));
        backfilled.add(sessionID);
      }).catch(() => {}).finally(() => {
        if (backfilling.get(sessionID) === controller)
          backfilling.delete(sessionID);
      });
    };
    const toggleCollapsed = () => {
      mutateUI((draft) => {
        draft.collapsed = !draft.collapsed;
      });
    };
    const renderSkillPreview = (skill, location) => {
      let raw;
      if (skill.path) {
        try {
          raw = readFileSync(skill.path, "utf8").replace(/\r\n/g, `
`);
        } catch {}
      }
      const previewSkill = createMemo2(() => ({
        ...skill,
        fileSamples: fileSamples().get(sampleKey(skill, location))
      }));
      return _$createComponent3(SkillPreviewDialog, {
        ctx,
        get skill() {
          return previewSkill();
        },
        raw,
        theme: () => ctx.theme,
        get renderer() {
          return ctx.renderer;
        }
      });
    };
    const openSkillPreview = (skill, location) => {
      ensureFileSamples(skill, location, true);
      ctx.renderer.clearSelection();
      ctx.ui.dialog.show(() => renderSkillPreview(skill, location));
      ctx.ui.dialog.set({
        size: "xlarge",
        centered: true
      });
    };
    const refreshSkills = async (location) => {
      if (disposed)
        return true;
      const requestID = ++refreshID;
      const key = locationKey(location);
      setRefreshByLocation((current) => new Map(current).set(key, {
        id: requestID
      }));
      try {
        const available = await loadAvailableSkills(ctx, location);
        if (disposed || refreshByLocation().get(key)?.id !== requestID)
          return true;
        return available.length > 0;
      } catch (error) {
        if (disposed || refreshByLocation().get(key)?.id !== requestID)
          return true;
        setRefreshByLocation((current) => new Map(current).set(key, {
          id: requestID,
          failure: {
            skills: ctx.data.location.skill.list(location),
            agents: ctx.data.location.agent.list(location)
          }
        }));
        if (requestID !== refreshID)
          return true;
        ctx.ui.toast.show({
          variant: "error",
          title: "Skills",
          message: `Failed to load skills: ${error instanceof Error ? error.message : String(error)}`,
          duration: 5000
        });
        return false;
      }
    };
    const initialLocation = ctx.location ?? ctx.data.location.default();
    refreshSkills(initialLocation).then((ready) => {
      if (ready || disposed || refreshID !== 1)
        return;
      initialRefreshTimer = setTimeout(() => {
        if (refreshID !== 1)
          return;
        ctx.data.location.skill.invalidate(initialLocation);
        refreshSkills(initialLocation);
      }, 250);
    });
    const unregisterSkillUpdated = ctx.data.on("skill.updated", (event) => {
      const location = event.location ?? initialLocation;
      clearFileSamples(location);
      refreshSkills(location);
    });
    const unregisterProjectUpdated = ctx.data.on("project.updated", () => {
      const location = ctx.location ?? ctx.data.location.default();
      clearFileSamples(location);
      refreshSkills(location);
    });
    const unregisterSkillActivated = ctx.data.on("session.skill.activated", (event) => {
      const sessionID = event.data.sessionID;
      if (disposed || deletedSessions.has(sessionID))
        return;
      ctx.data.session.message.invalidate(sessionID);
      ctx.data.session.message.sync(sessionID).catch(() => {});
    });
    const unregisterSessionDeleted = ctx.data.on("session.deleted", (event) => {
      const sessionID = event.data.sessionID;
      deletedSessions.add(sessionID);
      resetLoaded(sessionID);
      compactionBySession.delete(sessionID);
    });
    const unregisterCompactionEnded = ctx.data.on("session.compaction.ended", (event) => {
      const sessionID = event.data.sessionID;
      if (disposed || deletedSessions.has(sessionID))
        return;
      const state = extractSkillLoadState(ctx.data.session.message.list(sessionID));
      if (state.compactionID)
        applyLoads(sessionID, state);
      else
        resetLoaded(sessionID);
      ensureBackfill(sessionID);
    });
    const skillsView = (sessionID, mode, loaded) => {
      const current = sessionID ? ctx.data.session.get(sessionID) : undefined;
      const empty = {
        skills: [],
        modelVisibleCount: 0,
        registeredCount: 0,
        emptyMessage: "Loading skills\u2026"
      };
      if (disposed || sessionID && !current)
        return empty;
      const location = current?.location ?? ctx.location ?? ctx.data.location.default();
      const registered = ctx.data.location.skill.list(location);
      const agents = ctx.data.location.agent.list(location);
      const failure = refreshByLocation().get(locationKey(location))?.failure;
      const failed = failure && (registered === undefined || agents === undefined || registered === failure.skills && agents === failure.agents);
      const emptyMessage = failed ? "Failed to load skills" : "Loading skills\u2026";
      if (registered === undefined || mode === "model" && agents === undefined)
        return {
          ...empty,
          emptyMessage
        };
      const agent = current?.agent === undefined ? agents?.[0] : agents?.find((item) => item.id === current.agent);
      if (!agent && mode === "model")
        return {
          ...empty,
          emptyMessage: failed ? emptyMessage : `Agent unavailable${current?.agent === undefined ? "" : `: ${current.agent}`}`
        };
      const permissions = [...agent?.permissions ?? [], ...current?.permissions ?? []];
      return {
        skills: toSummaries(registered, permissions, loaded, mode).map((skill) => {
          const files = fileSamples().get(sampleKey(skill, location));
          return files === undefined ? skill : {
            ...skill,
            fileSamples: files
          };
        }),
        modelVisibleCount: agent ? toSummaries(registered, permissions).length : 0,
        registeredCount: toSummaries(registered, [], undefined, "registered").length,
        emptyMessage: failed ? emptyMessage : mode === "loaded" ? "No skills loaded" : mode === "registered" || registered.length === 0 ? "No skills registered" : "No model-visible skills"
      };
    };
    const insertSkill = (skill, location) => {
      if (disposed)
        return;
      const registered = ctx.data.location.skill.list(location);
      const index = registered?.findIndex((entry) => entry.id === skill.id) ?? -1;
      const warn = (message) => ctx.ui.toast.show({
        title: "Skills",
        variant: "warning",
        message
      });
      if (!registered || index < 0)
        return warn("Skill is no longer registered");
      const ids = registered.map((entry) => entry.id);
      const route = JSON.stringify(ctx.ui.router.current());
      stopNativeSelection?.();
      let prompt;
      let active = true;
      let releaseFrame;
      const gate = new Promise((resolve) => {
        releaseFrame = resolve;
      });
      const beforeFrame = () => gate;
      const ready = () => {
        if (!active || disposed)
          return;
        const currentRoute = ctx.ui.router.current();
        const currentLocation = currentRoute.type === "session" ? ctx.data.session.get(currentRoute.sessionID)?.location : ctx.location ?? ctx.data.location.default();
        if (JSON.stringify(currentRoute) !== route || !currentLocation || locationKey(currentLocation) !== locationKey(location)) {
          stopNativeSelection?.();
          return warn("Session changed; try again");
        }
        const editor = ctx.renderer.currentFocusedEditor;
        if (!prompt) {
          const traits = editor?.traits;
          if (traits?.owner !== "opencode" || traits.role !== "prompt")
            return;
          if (traits.status === "SHELL") {
            stopNativeSelection?.();
            return warn("Prompt busy; try again");
          }
          if (!ctx.keymap.commands().some((command) => command.id === "prompt.skills"))
            return;
          prompt = editor;
          ctx.renderer.setFrameCallback(beforeFrame);
          ctx.keymap.dispatch("prompt.skills");
          return;
        }
        if (editor === prompt) {
          stopNativeSelection?.();
          return;
        }
        if (!(editor instanceof InputRenderable) || editor.traits.status !== "FILTER")
          return;
        stopNativeSelection?.();
        const current = ctx.data.location.skill.list(location);
        if (disposed || prompt.isDestroyed || !current || current.length !== ids.length || current.some((entry, i) => entry.id !== ids[i])) {
          if (!disposed)
            warn("Skills changed; pick the skill again");
          return;
        }
        ctx.keymap.dispatch("dialog.select.home");
        for (let i = 0;i < index; i++)
          ctx.keymap.dispatch("dialog.select.next");
        ctx.keymap.dispatch("dialog.select.submit");
      };
      const timer = setTimeout(() => {
        stopNativeSelection?.();
        if (!disposed)
          warn("Skill picker unavailable; close and try again");
      }, 5000);
      stopNativeSelection = () => {
        active = false;
        clearTimeout(timer);
        ctx.renderer.off(CliRenderEvents2.FOCUSED_EDITOR, ready);
        ctx.renderer.removeFrameCallback(beforeFrame);
        releaseFrame();
        stopNativeSelection = undefined;
      };
      ctx.renderer.on(CliRenderEvents2.FOCUSED_EDITOR, ready);
      ctx.ui.dialog.clear();
      queueMicrotask(ready);
    };
    const openSettings = () => {
      if (disposed)
        return;
      stopNativeSelection?.();
      ctx.renderer.clearSelection();
      ctx.ui.dialog.show(() => _$createComponent3(SkillsDialog, {
        ctx,
        settings,
        onChange: changeSettings
      }));
      ctx.ui.dialog.set({
        size: "medium",
        centered: true
      });
    };
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "opencode-skills-tui.sider",
        title: "Skills Sidebar",
        description: "Configure the skills sidebar",
        group: "Skills",
        palette: true,
        slash: {
          name: "skills-sidebar"
        },
        run: openSettings
      }]
    }));
    const unregisterSlot = ctx.ui.slot({
      append: "sidebar.content",
      render: (input) => {
        const session = createMemo2(() => ctx.data.session.get(input.sessionID));
        createEffect2(() => {
          const location = session()?.location;
          if (!location || disposed)
            return;
          refreshSkills({
            directory: location.directory,
            workspaceID: location.workspaceID
          });
        });
        const panel = createMemo2(() => skillsView(input.sessionID, settings().scope, loadedBySession().get(input.sessionID) ?? EMPTY_LOADED_SKILLS));
        createEffect2(() => {
          const location = session()?.location;
          const token = settings().token;
          if (!location || disposed || settings().switch !== "on" || token !== "load-delta" && token !== "loaded-total")
            return;
          for (const skill of panel().skills)
            ensureFileSamples(skill, location);
        });
        createEffect2(() => {
          applyLoads(input.sessionID, extractSkillLoadState(ctx.data.session.message.list(input.sessionID)));
          ensureBackfill(input.sessionID);
        });
        return _$createComponent3(Show3, {
          get when() {
            return settings().switch === "on";
          },
          get children() {
            return _$createComponent3(SkillsPanel, {
              skills: () => panel().skills,
              modelVisibleCount: () => panel().modelVisibleCount,
              registeredCount: () => panel().registeredCount,
              scope: () => settings().scope,
              showState: () => settings().state === "on",
              tokenMode: () => settings().token,
              emptyMessage: () => panel().emptyMessage,
              loadedIDs: () => loadedBySession().get(input.sessionID) ?? EMPTY_LOADED_SKILLS,
              theme: () => ctx.theme,
              themeMode: () => ctx.themeMode,
              collapsed: () => ui.collapsed,
              onToggle: toggleCollapsed,
              onSkillClick: (skill, button) => {
                const click = ["left-click", "middle-click", "right-click"][button];
                if (settings().mention === click) {
                  const location = session()?.location;
                  if (location)
                    insertSkill(skill, location);
                } else if (settings().preview === click) {
                  openSkillPreview(skill, session()?.location ?? ctx.location ?? ctx.data.location.default());
                }
              }
            });
          }
        });
      }
    });
    return () => {
      disposed = true;
      stopNativeSelection?.();
      if (initialRefreshTimer !== undefined)
        clearTimeout(initialRefreshTimer);
      for (const controller of backfilling.values())
        controller.abort();
      backfilling.clear();
      for (const controller of sampling.values())
        controller.abort();
      sampling.clear();
      unregisterSlot();
      unregisterSkillUpdated();
      unregisterProjectUpdated();
      unregisterSkillActivated();
      unregisterSessionDeleted();
      unregisterCompactionEnded();
    };
  }
});
export {
  tui_default as default
};
