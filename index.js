import YAML from "https://cdn.jsdelivr.net/npm/yaml@2.7.0/+esm";
import LZ from "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/+esm";
import * as FNS from "https://cdn.jsdelivr.net/npm/date-fns@4.1.0/+esm";

const $ = {
  buttons: {
    /** @type {HTMLButtonElement} */
    import: document.querySelector("#import"),
    /** @type {HTMLButtonElement} */
    new: document.querySelector("#new"),
    /** @type {HTMLButtonElement} */
    example: document.querySelector("#example"),
    /** @type {HTMLButtonElement} */
    add: document.querySelector("#add"),
    /** @type {HTMLButtonElement} */
    delete: document.querySelector("#delete"),
    /** @type {HTMLButtonElement} */
    copy: document.querySelector("#copy"),
    /** @type {HTMLButtonElement} */
    link: document.querySelector("#link"),
    /** @type {HTMLButtonElement} */
    debug: document.querySelector("#debug"),
    /** @type {HTMLButtonElement} */
    export: document.querySelector("#export"),
    /** @type {HTMLButtonElement} */
    refresh: document.querySelector("#refresh"),
  },
  inputs: {
    /** @type {HTMLInputElement} */
    bucket: document.querySelector("#bucket"),
  },
  textarea: {
    /** @type {HTMLTextAreaElement} */
    custom: document.querySelector("#custom"),
    /** @type {HTMLTextAreaElement} */
    result: document.querySelector("#result"),
  },
  parents: {
    /** @type {HTMLDivElement} */
    templates: document.querySelector("#templates"),
  },
  texts: {
    /** @type {HTMLDivElement} */
    error: document.querySelector("#error"),
  },
};

const getHash = () => Date.now().toString(36).toLocaleUpperCase();

/** @param {HTMLDivElement} templateNode */
const templateToTree = (templateNode) => {
  /** @type {HTMLInputElement} */
  const name = templateNode.querySelector("#name");
  /** @type {HTMLTextAreaElement} */
  const code = templateNode.querySelector("#code");
  return { name, code };
};

const getTemplateTrees = () =>
  [...document.querySelectorAll(".template")].map(templateToTree);

/** @returns {HTMLDivElement} */
const pickTemplateNode = (id) => document.querySelector(`.template#_${id}`);

const updatePlaceholders = () => {
  const bucket = $.inputs.bucket.value || "##";
  $.inputs.bucket.placeholder = bucket;
  getTemplateTrees().forEach(({ name, code }) => {
    name.placeholder = "text";
    code.placeholder = `<div id="${bucket}id${bucket}">${bucket}body${bucket}</div><Accordion>`;
  });
  $.textarea.custom.placeholder = `- $: text
  id: aaaaa
  body:
    - $: text
      id: bbbbb
      body: |-
        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        Suspendisse malesuada lacus ex, sit amet blandit leo lobortis eget.
- $: text
  id: ""
  body: hello world!`;
  $.inputs.bucket.placeholder = bucket;
};

const state = {
  bucket: "##",
  templates: [],
  custom: "",
};

const resizeAllTextarea = () => {
  [...document.querySelectorAll("textarea.resize")].forEach((textarea) => {
    const rows = (textarea.value || textarea.placeholder).split("\n").length;
    textarea.rows = rows;
  });
};

const addTemplate = (isRestore) => {
  let el = document.createElement("div");
  el.innerHTML = `<div class="template" id="_N">
      <p>name: <input id="name" /></p>
      <textarea id="code" class="resize" rows="15" cols="120"></textarea>
    </div>`;
  el = el.childNodes[0];
  const id = getTemplateTrees().length;
  el.id = `_${id}`;
  $.parents.templates.append(el);
  const { name, code } = templateToTree(el);
  if (isRestore) {
    const template = state.templates[id];
    name.value = template.name;
    code.value = template.code;
  } else {
    state.templates.push({ name: "", code: "" });
    update();
  }
  name.onkeyup = () => update();
  code.onkeyup = () => (update(), resizeAllTextarea());
};

const deleteTemplate = () => {
  state.templates.pop();
  pickTemplateNode(state.templates.length).remove();
};

const parseCustomToYaml = () => {
  try {
    const isDefault = !$.textarea.custom.value;
    const result = YAML.parse(
      $.textarea.custom.value || $.textarea.custom.placeholder
    );
    if (!Array.isArray(result)) throw new Error("faild to parse YAML");
    console.log("success parsed YAML");
    return isDefault ? null : result;
  } catch (error) {
    console.warn(error);
    return null;
  }
};

const getTime = (format, interval) => {
  const now = new Date();
  const value = parseInt(interval, 10);
  const type = `${interval}`.slice(-1);
  const base = { h: "Hours", m: "Minutes", s: "Seconds" };
  if (!/\d+([hms])/.test(interval) || !base[type])
    return "|$settings.time.interval is invalid format|";
  now["set" + base[type]](
    Math.floor(now["get" + base[type]]() / value) * value,
    ...[0, 0]
  );
  return FNS.format(now, format);
};

const convertResult = () => {
  try {
    const renderNode = (value, templates, B, opt) => {
      const escB = B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const META_REGEX = new RegExp(`${escB}([A-Z]+)(:(.*?))?${escB}`, "g");
      if (Array.isArray(value)) {
        if (value.every((item) => typeof item === "string"))
          return value.join("\n");
        return value.map((child) => renderNode(child, templates, B)).join("");
      }
      if (value && typeof value === "object" && value.$) {
        const { $: templateName, ...rest } = value;
        const template = templates.find((t) => t.name === templateName);
        if (!template) return "";
        const props = Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [k, renderNode(v, templates, B)])
        );
        let code = template.code;
        code = code.replace(META_REGEX, (match, name, _, arg) => {
          if (name === "LINE") return "\n".repeat(Math.abs(arg ?? 1));
          if (name === "DATE")
            return FNS.format(
              new Date(),
              opt?.settings?.date?.format ?? "yyyy/MM/dd"
            );
          if (name === "TIME") {
            const { time } = opt?.settings ?? {};
            if (!time) return new Date().toLocaleTimeString();
            const { format, interval } = time ?? {};
            return getTime(format ?? "hh:mm:ss", interval ?? "1s");
          }
          if (name === "GB") return arg ? opt?.globals[arg] ?? match : match;
          if (name === "REM") return "";
          if (name === "DEF") {
            const args = arg.split(",");
            if (args.length !== 2) return "|DEF is invalid format|";
            const [name, replace] = args;
            return props[name] ?? replace;
          }
          return match;
        });
        return Object.entries(props).reduce((acc, [key, value]) => {
          const placeholder = `${B}${key}${B}`;
          return acc.split(placeholder).join(value);
        }, code);
      }
      return `${value}`;
    };
    const { bucket, custom: items } = state;
    const componentItems = items.filter((item) => item.$);
    const globals = items.find((item) => item.$globals)?.$globals ?? {};
    const settings = items.find((item) => item.$settings)?.$settings ?? {};
    $.textarea.result.value = componentItems
      .map((item) =>
        renderNode(item, state.templates, bucket, { globals, settings })
      )
      .join("");
    $.texts.error.textContent = `success convert result (${getHash()})`;
  } catch (error) {
    $.texts.error.textContent = `failed to convert result (${getHash()})`;
    console.warn(error);
  }
};

const restoreFromUri = () => {
  if (!location.hash.match(/lz:/)) return addTemplate();
  const result = JSON.parse(
    LZ.decompressFromEncodedURIComponent(location.hash.match(/lz:(.*)/)?.[1])
  );
  state.bucket = result.bucket;
  state.templates = result.templates;
  state.custom = result.custom;
  state.templates.forEach(() => addTemplate(true));
};

const update = () => {
  state.bucket = $.inputs.bucket.value;
  state.templates.forEach((template, id) => {
    const tree = templateToTree(pickTemplateNode(id));
    template.name = tree.name.value;
    template.code = tree.code.value;
  });
  state.custom = parseCustomToYaml() ?? "";
  location.hash = `lz:${LZ.compressToEncodedURIComponent(
    JSON.stringify(state)
  )}`;
  updatePlaceholders();
  resizeAllTextarea();
  convertResult();
};

const onImport = (code = null) => {
  const process = (json) => {
    try {
      const importedState = JSON.parse(json);
      state.bucket = importedState.bucket;
      state.templates = importedState.templates;
      state.custom = importedState.custom;
      while ($.parents.templates.firstChild)
        $.parents.templates.removeChild($.parents.templates.firstChild);
      state.templates.forEach(() => addTemplate(true));
      $.inputs.bucket.value = state.bucket;
      $.textarea.custom.value = state.custom
        ? YAML.stringify(state.custom)
        : "";
      update();
    } catch (error) {
      $.texts.error.textContent = "failed to parse JSON file";
    }
  };
  if (code === null) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = () => {
      const file = input.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => process(event.target.result);
        reader.readAsText(file);
      }
    };
    input.click();
    return;
  }
  process(code);
};

const onExport = () => {
  const title = prompt("ファイル名を入力", "tm_");
  if (title === null) return;
  const jsonString = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const onCopy = (text, note) => {
  navigator.clipboard
    .writeText(text)
    .then(() => ($.texts.error.textContent = `copied to clipboard ${note}!`))
    .catch((error) => {
      $.texts.error.textContent = `failed to copy to clipboard ${note}`;
      console.error(error);
    });
};

document.body.onload = () => {
  restoreFromUri();

  $.inputs.bucket.value = state.bucket ?? "##";
  $.textarea.custom.value = state.custom ? YAML.stringify(state.custom) : "";

  $.buttons.new.onclick = () =>
    (location.href = location.href.replace(location.hash, ""));
  $.buttons.add.onclick = () => addTemplate();
  $.buttons.delete.onclick = () => deleteTemplate();
  $.inputs.bucket.onkeyup = () => update();
  $.textarea.result.onkeyup = () => update();
  $.textarea.custom.onkeyup = () => (update(), resizeAllTextarea());
  $.buttons.import.onclick = () => onImport();
  $.buttons.export.onclick = () => onExport();
  $.buttons.copy.onclick = () => onCopy($.textarea.result.value, "result");
  $.buttons.link.onclick = () => onCopy(location.href, "link");
  $.buttons.example.onclick = () =>
    confirm(
      "Load the example project.\nYour working data will be deleted.\nAre you sure?"
    ) &&
    fetch("./tm_example.json")
      .then((x) => x.text())
      .then((res) => onImport(res));
  $.buttons.refresh.onclick = () => update();
  $.buttons.debug.onclick = () => {
    onCopy(JSON.stringify(state, null, 2), "state");
    console.log({ $, state });
  };

  updatePlaceholders();
  resizeAllTextarea();
  convertResult();
};
