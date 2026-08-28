const state = {
  fileHandle: null,
  fileName: "",
  columns: ["id","name","company","postal_code","address","tel","email","note"],
  rows: [],
  editingIndex: null,
  postcardIndices: []
};

const $ = id => document.getElementById(id);

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i=0; i<text.length; i++) {
    const c = text[i], n = text[i+1];
    if (inQuotes) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ""; }
      else if (c === '\n') { row.push(cell); rows.push(row); row=[]; cell=""; }
      else if (c !== '\r') cell += c;
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  if (!rows.length) return {columns: state.columns, rows: []};
  const columns = rows[0].map(x => x.trim());
  const data = rows.slice(1).filter(r => r.some(x => x !== "")).map(r => {
    const o = {};
    columns.forEach((c,i) => o[c] = r[i] ?? "");
    return o;
  });
  return {columns, rows:data};
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function makeCSV() {
  return state.columns.join(",") + "\r\n" +
    state.rows.map(r => state.columns.map(c => csvEscape(r[c])).join(",")).join("\r\n") + "\r\n";
}

function render() {
  const q = $("searchInput").value.trim().toLowerCase();
  const visible = state.rows.map((r,i)=>({r,i})).filter(x =>
    !q || state.columns.some(c => String(x.r[c]??"").toLowerCase().includes(q))
  );
  $("countLabel").textContent = `${visible.length}件 / 全${state.rows.length}件`;
  $("saveCsvBtn").disabled = !state.fileHandle && state.rows.length === 0;
  $("postcardBtn").disabled = state.rows.length === 0;

  const thead = $("customerTable").querySelector("thead");
  const tbody = $("customerTable").querySelector("tbody");
  thead.innerHTML = `<tr><th class="check">印刷</th>${state.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  tbody.innerHTML = visible.map(({r,i}) => `
    <tr class="customer-row" data-index="${i}">
      <td class="check"><input type="checkbox" class="print-check" data-index="${i}" onclick="event.stopPropagation()"></td>
      ${state.columns.map(c=>`<td>${escapeHtml(r[c])}</td>`).join("")}
    </tr>
  `).join("");

  tbody.querySelectorAll(".customer-row").forEach(tr => {
    tr.addEventListener("click", () => openEdit(Number(tr.dataset.index)));
  });
}

async function openCSV() {
  try {
    // Local files may expose the API but still reject the permission request.
    if (location.protocol !== "file:" && window.isSecureContext && "showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{description:"CSV", accept:{"text/csv":[".csv"]}}],
        multiple:false
      });
      const file = await handle.getFile();
      const parsed = parseCSV(await file.text());
      state.fileHandle = handle;
      state.fileName = file.name;
      state.columns = parsed.columns;
      state.rows = parsed.rows;
    } else {
      $("csvFileInput").click();
      return;
    }
    $("fileStatus").textContent = state.fileName;
    render();
  } catch (e) {
    if (e.name === "AbortError") return;
    // Fall back to the regular file input when the picker is blocked.
    $("csvFileInput").click();
  }
}

async function openFallbackFile(file) {
  if (!file) return;
  const parsed = parseCSV(await file.text());
  state.fileHandle = null;
  state.fileName = file.name;
  state.columns = parsed.columns;
  state.rows = parsed.rows;
  $("fileStatus").textContent = state.fileName + "（保存時に名前を付けて保存）";
  render();
}

async function saveCSV() {
  const blob = new Blob(["\uFEFF" + makeCSV()], {type:"text/csv;charset=utf-8"});
  if (state.fileHandle) {
    try {
      const writable = await state.fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      alert("CSVを保存しました。");
      return;
    } catch (e) {
      alert("元のCSVへ保存できなかったため、名前を付けて保存します。");
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.fileName || "customer.csv";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function openNew() {
  state.editingIndex = null;
  $("dialogTitle").textContent = "顧客登録";
  $("deleteBtn").style.display = "none";
  $("customerForm").reset();
  $("customerDialog").showModal();
}
function openEdit(index) {
  state.editingIndex = index;
  const r = state.rows[index];
  $("dialogTitle").textContent = "顧客情報の編集";
  $("deleteBtn").style.display = "inline-block";
  const f = $("customerForm");
  state.columns.forEach(c => { if (f.elements[c]) f.elements[c].value = r[c] ?? ""; });
  $("customerDialog").showModal();
}
function formObject() {
  const f = $("customerForm"), o = {};
  state.columns.forEach(c => o[c] = f.elements[c]?.value ?? "");
  return o;
}

function submitCustomer(e) {
  e.preventDefault();
  const o = formObject();
  if (!o.id || !o.name) { alert("顧客IDと氏名は必須です。"); return; }
  const duplicate = state.rows.some((r,i)=>r.id === o.id && i !== state.editingIndex);
  if (duplicate) { alert("同じ顧客IDがすでに存在します。"); return; }
  if (state.editingIndex === null) state.rows.push(o);
  else state.rows[state.editingIndex] = o;
  $("customerDialog").close();
  render();
}
function deleteCustomer() {
  if (state.editingIndex === null) return;
  const r = state.rows[state.editingIndex];
  if (confirm(`「${r.name}」を削除します。よろしいですか？`)) {
    state.rows.splice(state.editingIndex,1);
    $("customerDialog").close();
    render();
  }
}

function selectedIndices() {
  return [...document.querySelectorAll(".print-check:checked")].map(x=>Number(x.dataset.index));
}
function addressText(r) {
  return `〒${r.postal_code || ""}\n${r.address || ""}`;
}
function postcardHTML(r) {
  return `<div class="postcard">
    <div class="postal">${escapeHtml(r.postal_code || "")}</div>
    <div class="address">${escapeHtml((r.address || "").replace(/　/g,"\n"))}</div>
    ${r.company ? `<div class="company">${escapeHtml(r.company)}</div>` : ""}
    <div class="name">${escapeHtml(r.name || "")} 様</div>
  </div>`;
}
function openPostcard() {
  let indices = selectedIndices();
  if (!indices.length) {
    const q = $("searchInput").value.trim().toLowerCase();
    indices = state.rows.map((r,i)=>({r,i})).filter(x =>
      !q || state.columns.some(c=>String(x.r[c]??"").toLowerCase().includes(q))
    ).map(x=>x.i).slice(0,1);
    if (!indices.length) { alert("印刷する顧客を選択してください。"); return; }
  }
  state.postcardIndices = indices;
  const r = state.rows[indices[0]];
  $("postcardInfo").textContent = indices.length === 1
    ? `${r.name} 様のプレビュー`
    : `${indices.length}件をPDF/印刷します（プレビューは先頭の1件）`;
  $("postcardPreview").innerHTML = postcardHTML(r);
  $("postcardDialog").showModal();
}

function printPostcards() {
  const cards = state.postcardIndices.map(i=>postcardHTML(state.rows[i])).join("");
  const w = window.open("", "_blank");
  if (!w) { alert("ポップアップがブロックされました。ポップアップを許可してください。"); return; }
  w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>はがき宛名</title>
    <style>
      @page { size: 100mm 148mm; margin: 0; }
      html,body { margin:0; padding:0; }
      .postcard { width:100mm; height:148mm; position:relative; background:white; color:#111;
        font-family:"Yu Mincho","Hiragino Mincho ProN",serif; page-break-after:always; overflow:hidden; }
      .postal { position:absolute; top:13mm; right:8mm; font-family:sans-serif; font-size:11pt; letter-spacing:1.5px; }
      .address { position:absolute; top:34mm; right:19mm; width:58mm; writing-mode:vertical-rl; text-orientation:mixed;
        font-size:15pt; line-height:1.8; white-space:pre-wrap; }
      .name { position:absolute; top:70mm; right:7mm; width:27mm; writing-mode:vertical-rl; text-orientation:mixed;
        font-size:18pt; font-weight:600; white-space:nowrap; }
      .company { position:absolute; top:67mm; right:38mm; width:22mm; writing-mode:vertical-rl; font-size:10pt; white-space:nowrap; }
    </style></head><body>${cards}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(()=>w.print(), 300);
}

$("openCsvBtn").addEventListener("click", openCSV);
$("csvFileInput").addEventListener("change", e => openFallbackFile(e.target.files[0]));
$("saveCsvBtn").addEventListener("click", saveCSV);
$("newBtn").addEventListener("click", openNew);
$("customerForm").addEventListener("submit", submitCustomer);
$("deleteBtn").addEventListener("click", deleteCustomer);
$("cancelBtn").addEventListener("click", ()=>$("customerDialog").close());
$("searchInput").addEventListener("input", render);
$("clearSearchBtn").addEventListener("click", ()=>{$("searchInput").value=""; render();});
$("postcardBtn").addEventListener("click", openPostcard);
$("postcardCancelBtn").addEventListener("click", ()=>$("postcardDialog").close());
$("printBtn").addEventListener("click", printPostcards);

render();
