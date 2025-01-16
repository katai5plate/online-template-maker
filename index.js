import YAML from "https://cdn.jsdelivr.net/npm/yaml@2.7.0/+esm";
import LZ from "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/+esm";

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

const addTemplate = (isRestore) => {
  let el = document.createElement("div");
  el.innerHTML = `<div class="template" id="_N">
      <p>name: <input id="name" /></p>
      <textarea id="code" rows="15" cols="120"></textarea>
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
  code.onkeyup = () => update();
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
    if (!Array.isArray(result)) throw new Error("invalid format");
    $.texts.error.textContent = "success!";
    return isDefault ? null : result;
  } catch (error) {
    $.texts.error.textContent = error.message.split("\n")[0];
    return null;
  }
};

const convertResult = () => {
  try {
    const renderNode = (node, templates, bucket) => {
      if (Array.isArray(node))
        return node
          .map((child) => renderNode(child, templates, bucket))
          .join("");
      if (node && typeof node === "object" && node.$) {
        const { $: templateName, ...rest } = node;
        const template = templates.find((t) => t.name === templateName);
        if (!template) return "";
        const props = Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [
            k,
            renderNode(v, templates, bucket),
          ])
        );
        return Object.entries(props).reduce((acc, [key, value]) => {
          const placeholder = `${bucket}${key}${bucket}`;
          return acc.split(placeholder).join(value);
        }, template.code);
      }
      return `${node}`;
    };
    const { bucket, custom: items } = state;
    $.textarea.result.value = items
      .map((item) => renderNode(item, state.templates, bucket))
      .join("");
  } catch {
    $.texts.error.textContent = "convert failed";
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
  $.textarea.custom.onkeyup = () => update();
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
    $.texts.error.textContent = "the log has been output!";
    console.log({ $, state });
  };

  updatePlaceholders();
  convertResult();
};
