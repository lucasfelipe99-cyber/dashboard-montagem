import { WORK_SCHEDULE } from "../config.js";
import { findEmployeeSchedule, loadOperationalSettings, saveOperationalSettings, clearOperationalSettings, formatSettingTime } from "../services/settingsService.js";
import { parseTime, secondsToDuration } from "../utils/dateUtils.js";

function optionList(values, selected, placeholder) {
  return `<option value="">${placeholder}</option>${values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("")}`;
}

function workTypeOptions(selected = "Montagem") {
  return `
    <option value="Montagem" ${selected === "Montagem" ? "selected" : ""}>Montagem</option>
    <option value="Produção" ${selected === "Produção" ? "selected" : ""}>Produção</option>
  `;
}

const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const numberValue = (value) => Number(String(value ?? "").replace(",", ".").trim()) || 0;
const isCompoundStructure = (item) => clean(item.structureKind) === "compound" || normalize(item.cutStageCode) === "PRODUTO";

function durationFromSeconds(seconds) {
  return seconds ? secondsToDuration(seconds) : "";
}

function productSummary(structures, product, quantity = 1, trail = []) {
  const productKey = normalize(product);
  if (!productKey || trail.includes(productKey)) return { pieces: 0, cutUnitSeconds: 0, cutBatchSeconds: 0, assemblySeconds: 0 };
  return structures
    .filter((item) => normalize(item.product) === productKey && numberValue(item.unitsPerProduct) > 0)
    .reduce((summary, item) => {
      const units = numberValue(item.unitsPerProduct) * quantity;
      if (isCompoundStructure(item)) {
        const child = productSummary(structures, item.stage, units, [...trail, productKey]);
        summary.pieces += child.pieces;
        summary.cutUnitSeconds += child.cutUnitSeconds;
        summary.cutBatchSeconds += child.cutBatchSeconds;
        summary.assemblySeconds += child.assemblySeconds;
        return summary;
      }
      summary.pieces += units;
      summary.cutUnitSeconds += (parseTime(item.cutUnitTime) || 0) * units;
      summary.cutBatchSeconds += (parseTime(item.cutBatchTime) || 0) * (item.piecesPerStage ? units / numberValue(item.piecesPerStage) : 1);
      summary.assemblySeconds += (parseTime(item.assemblyUnitTime) || 0) * units;
      return summary;
    }, { pieces: 0, cutUnitSeconds: 0, cutBatchSeconds: 0, assemblySeconds: 0 });
}

function scheduleRows(records, settings) {
  const employees = [...new Set(records.map((record) => record.employee).filter(Boolean))].sort();
  const shifts = [...new Set(records.map((record) => record.shift).filter(Boolean))].sort();
  return employees.map((employee) => {
    const current = findEmployeeSchedule(settings.employeeSchedules, employee) || {};
    const shift = current.shift || records.find((record) => record.employee === employee)?.shift || "";
    const fallback = Object.values(WORK_SCHEDULE).find((item) => item.label === shift) || WORK_SCHEDULE.turno1;
    return `
      <tr class="schedule-row">
        <td><input value="${employee}" data-setting="employee" list="employee-options"></td>
        <td><select data-setting="workType">${workTypeOptions(current.workType || "Montagem")}</select></td>
        <td><select data-setting="shift">${optionList(shifts, shift, "Turno")}</select></td>
        <td><input type="time" value="${current.start || fallback.start}" data-setting="start"></td>
        <td><input type="time" value="${current.end || fallback.end}" data-setting="end"></td>
        <td><input type="time" value="${current.breakStart || ""}" data-setting="breakStart"></td>
        <td><input type="time" value="${current.breakEnd || ""}" data-setting="breakEnd"></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `;
  }).join("");
}

function theoryRows(records, settings) {
  const products = [...new Set(records.filter((record) => !record.isIdle).map((record) => record.product).filter(Boolean))].sort();
  const configured = new Map(settings.theoreticalTimes.map((item) => [item.product, item]));
  return products.map((product) => {
    const current = configured.get(product);
    const sample = records.find((record) => record.product === product && record.theoreticalUnitSeconds);
    const value = current?.theoreticalUnitTime || (sample ? secondsToDuration(sample.theoreticalUnitSeconds) : "");
    return `
      <tr class="theory-row">
        <td><input value="${product}" data-setting="product" list="product-options"></td>
        <td><input value="${formatSettingTime(value) || value}" placeholder="00:08:30" data-setting="theoreticalUnitTime"></td>
        <td><span class="muted">${sample ? secondsToDuration(sample.theoreticalUnitSeconds) : "Sem base"}</span></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `;
  }).join("");
}

function structureRows(settings) {
  return settings.productStructures.map((item) => {
    const isCompound = isCompoundStructure(item);
    const inherited = isCompound ? productSummary(settings.productStructures, item.stage, Number(item.unitsPerProduct || 0)) : null;
    return `
      <tr class="structure-row ${isCompound ? "compound-structure-row" : ""}">
        <td><input value="${item.product}" data-setting="product" list="structure-product-options"></td>
        <td><input value="${item.stage}" data-setting="stage" list="structure-stage-options"></td>
        <td><input value="${isCompound ? "PRODUTO" : item.cutStageCode || ""}" data-setting="cutStageCode" placeholder="P17"></td>
        <td><input type="number" min="0" step="0.01" value="${item.unitsPerProduct || ""}" data-setting="unitsPerProduct"></td>
        <td><input type="number" min="0" step="0.01" value="${isCompound ? inherited.pieces || "" : item.piecesPerStage || ""}" data-setting="piecesPerStage" ${isCompound ? "readonly" : ""}></td>
        <td><input value="${isCompound ? durationFromSeconds(inherited.cutUnitSeconds) : formatSettingTime(item.cutUnitTime) || item.cutUnitTime || ""}" data-setting="cutUnitTime" placeholder="00:00:47" ${isCompound ? "readonly" : ""}></td>
        <td><input value="${isCompound ? durationFromSeconds(inherited.cutBatchSeconds) : formatSettingTime(item.cutBatchTime) || item.cutBatchTime || ""}" data-setting="cutBatchTime" placeholder="00:38:44" ${isCompound ? "readonly" : ""}></td>
        <td><input value="${isCompound ? durationFromSeconds(inherited.assemblySeconds) : formatSettingTime(item.assemblyUnitTime) || item.assemblyUnitTime || ""}" data-setting="assemblyUnitTime" placeholder="00:05:00" ${isCompound ? "readonly" : ""}></td>
        <td hidden><input value="${isCompound ? "compound" : "stage"}" data-setting="structureKind"></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `;
  }).join("");
}

function simpleStructureRow() {
  return `
    <tr class="structure-row">
      <td><input data-setting="product" list="structure-product-options" placeholder="Produto pronto"></td>
      <td><input data-setting="stage" list="structure-stage-options" placeholder="Palco / item de corte"></td>
      <td><input data-setting="cutStageCode" placeholder="P17"></td>
      <td><input type="number" min="0" step="0.01" value="1" data-setting="unitsPerProduct" placeholder="1"></td>
      <td><input type="number" min="0" step="0.01" data-setting="piecesPerStage" placeholder="88"></td>
      <td><input data-setting="cutUnitTime" placeholder="00:00:47"></td>
      <td><input data-setting="cutBatchTime" placeholder="00:38:44"></td>
      <td><input data-setting="assemblyUnitTime" placeholder="00:05:00"></td>
      <td hidden><input value="stage" data-setting="structureKind"></td>
      <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
    </tr>
  `;
}

function readStructureRowsFromDom() {
  return [...document.querySelectorAll(".structure-row")].map(readRow);
}

function refreshCompoundStructureRows() {
  const structures = readStructureRowsFromDom();
  document.querySelectorAll(".structure-row").forEach((row) => {
    const kind = row.querySelector("[data-setting='structureKind']")?.value;
    const code = row.querySelector("[data-setting='cutStageCode']")?.value;
    if (kind !== "compound" && normalize(code) !== "PRODUTO") return;
    const stage = row.querySelector("[data-setting='stage']")?.value || "";
    const quantity = numberValue(row.querySelector("[data-setting='unitsPerProduct']")?.value);
    const inherited = productSummary(structures, stage, quantity);
    const piecesInput = row.querySelector("[data-setting='piecesPerStage']");
    const cutUnitInput = row.querySelector("[data-setting='cutUnitTime']");
    const cutBatchInput = row.querySelector("[data-setting='cutBatchTime']");
    const assemblyInput = row.querySelector("[data-setting='assemblyUnitTime']");
    if (piecesInput) piecesInput.value = inherited.pieces || "";
    if (cutUnitInput) cutUnitInput.value = durationFromSeconds(inherited.cutUnitSeconds);
    if (cutBatchInput) cutBatchInput.value = durationFromSeconds(inherited.cutBatchSeconds);
    if (assemblyInput) assemblyInput.value = durationFromSeconds(inherited.assemblySeconds);
  });
}

function connectionPanel(settings) {
  const primary = settings.dataConnection;
  const secondary = settings.secondaryDataConnection;
  const planning = settings.planningConnection;
  return `
    <article class="panel settings-panel">
      <div class="section-title">
        <div>
          <h2>Conexões das bases</h2>
          <p>Cadastre os dois links do Google Sheets. As bases Montagem e Corte serão unificadas no dashboard.</p>
        </div>
      </div>
      <div class="connection-stack">
        <div>
          <h3>Base 1 - Montagem</h3>
          <div class="connection-grid">
            <label>Fonte dos dados
              <input value="Google Sheets real" disabled>
            </label>
            <label>ID ou URL da planilha
              <input value="${primary.spreadsheetId || ""}" data-connection="spreadsheetId" placeholder="https://docs.google.com/spreadsheets/d/...">
            </label>
            <label>Nome da aba
              <input value="${primary.sheetName || "DB"}" data-connection="sheetName" placeholder="DB">
            </label>
            <label>GID da aba
              <input value="${primary.sheetGid || ""}" data-connection="sheetGid" placeholder="1017368919">
            </label>
            <label>Atualização automática
              <select data-connection="refreshInterval">
                <option value="0" ${primary.refreshInterval === 0 ? "selected" : ""}>Nao atualizar</option>
                <option value="30000" ${primary.refreshInterval === 30000 ? "selected" : ""}>30 segundos</option>
                <option value="60000" ${primary.refreshInterval === 60000 ? "selected" : ""}>60 segundos</option>
                <option value="120000" ${primary.refreshInterval === 120000 ? "selected" : ""}>2 minutos</option>
                <option value="300000" ${primary.refreshInterval === 300000 ? "selected" : ""}>5 minutos</option>
                <option value="600000" ${primary.refreshInterval === 600000 ? "selected" : ""}>10 minutos</option>
              </select>
            </label>
          </div>
        </div>
        <div>
          <h3>Base 2 - Corte</h3>
          <div class="connection-grid secondary-connection-grid">
            <label>Fonte dos dados
              <input value="Google Sheets real" disabled>
            </label>
            <label>ID ou URL da planilha
              <input value="${secondary.spreadsheetId || ""}" data-secondary-connection="spreadsheetId" placeholder="https://docs.google.com/spreadsheets/d/...">
            </label>
            <label>Nome da aba
              <input value="${secondary.sheetName || "DB"}" data-secondary-connection="sheetName" placeholder="DB">
            </label>
            <label>GID da aba
              <input value="${secondary.sheetGid || ""}" data-secondary-connection="sheetGid" placeholder="809312188">
            </label>
          </div>
          <p class="muted connection-note">Para carregar automaticamente, compartilhe a planilha como "qualquer pessoa com o link pode ver" ou publique a aba DB na Web em formato CSV.</p>
        </div>
      </div>
    </article>

    <article class="panel settings-panel">
      <div class="section-title">
        <div>
          <h2>Base de planejamento</h2>
          <p>Use uma planilha publica com as abas PLANO_MONTAGEM e PLANO_CORTE. A URL do Apps Script permite salvar os lancamentos direto no Sheets.</p>
        </div>
      </div>
      <div class="connection-grid planning-connection-grid">
        <label>ID ou URL da planilha
          <input value="${planning.spreadsheetId || ""}" data-planning-connection="spreadsheetId" placeholder="https://docs.google.com/spreadsheets/d/...">
        </label>
        <label>Aba montagem
          <input value="${planning.montagemSheetName || "PLANO_MONTAGEM"}" data-planning-connection="montagemSheetName" placeholder="PLANO_MONTAGEM">
        </label>
        <label>GID montagem
          <input value="${planning.montagemSheetGid || ""}" data-planning-connection="montagemSheetGid">
        </label>
        <label>Aba corte
          <input value="${planning.corteSheetName || "PLANO_CORTE"}" data-planning-connection="corteSheetName" placeholder="PLANO_CORTE">
        </label>
        <label>GID corte
          <input value="${planning.corteSheetGid || ""}" data-planning-connection="corteSheetGid">
        </label>
        <label>Maquinas de corte
          <input type="number" min="1" value="${planning.cuttingMachines || 14}" data-planning-connection="cuttingMachines">
        </label>
        <label class="wide-field">URL do Apps Script
          <input value="${planning.scriptUrl || ""}" data-planning-connection="scriptUrl" placeholder="https://script.google.com/macros/s/.../exec">
        </label>
      </div>
    </article>
  `;
}

export function Settings(records) {
  const settings = loadOperationalSettings();
  const employees = [...new Set(records.map((record) => record.employee).filter(Boolean))].sort();
  const products = [...new Set(records.filter((record) => !record.isIdle).map((record) => record.product).filter(Boolean))].sort();
  const structureProducts = [...new Set(settings.productStructures.map((item) => item.product).filter(Boolean))].sort();
  const structureStages = [...new Set(settings.productStructures.map((item) => item.stage).filter(Boolean))].sort();

  return `
    <section class="page-heading">
      <h1>Configurações</h1>
      <p>Cadastre bases, horários por funcionário e tempos teóricos unitários. As alterações ficam salvas neste navegador e recalculam o dashboard.</p>
    </section>
    <datalist id="employee-options">${employees.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
    <datalist id="product-options">${products.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
    <datalist id="structure-product-options">${structureProducts.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
    <datalist id="structure-stage-options">${structureStages.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
    <datalist id="composite-product-options">${structureProducts.map((item) => `<option value="${item}"></option>`).join("")}</datalist>

    <section class="settings-grid">
      ${connectionPanel(settings)}

      <article class="panel settings-panel">
        <div class="section-title">
          <div>
            <h2>Horários por funcionário</h2>
            <p>Use quando um funcionário tiver jornada diferente do turno padrão.</p>
          </div>
          <button class="button" data-action="add-schedule"><i data-lucide="plus"></i> Funcionário</button>
        </div>
        <div class="responsive-table">
          <table class="settings-table" id="schedule-settings">
            <thead><tr><th>Funcionário</th><th>Tipo</th><th>Turno</th><th>Entrada</th><th>Saída</th><th>Início pausa</th><th>Fim pausa</th><th></th></tr></thead>
            <tbody>${scheduleRows(records, settings)}</tbody>
          </table>
        </div>
      </article>

      <article class="panel settings-panel">
        <div class="section-title">
          <div>
            <h2>Tempo teórico por montagem</h2>
            <p>Informe o tempo unitário esperado. Ele tem prioridade sobre o valor vindo da planilha.</p>
          </div>
          <button class="button" data-action="add-theory"><i data-lucide="plus"></i> Montagem</button>
        </div>
        <div class="responsive-table">
          <table class="settings-table" id="theory-settings">
            <thead><tr><th>Montagem</th><th>Tempo teórico unitário</th><th>Valor da base</th><th></th></tr></thead>
            <tbody>${theoryRows(records, settings)}</tbody>
          </table>
        </div>
      </article>
      <article class="panel settings-panel">
        <div class="section-title">
          <div>
            <h2>Estrutura de produtos para corte</h2>
            <p>Cadastre quais palcos/itens formam cada produto pronto. O plano de corte usa esta estrutura para gerar as linhas automaticamente.</p>
          </div>
          <button class="button" data-action="add-structure"><i data-lucide="plus"></i> Estrutura</button>
        </div>
        <div class="responsive-table">
          <table class="settings-table structure-settings-table" id="structure-settings">
            <thead><tr><th>Produto pronto / final</th><th>Palco ou produto componente</th><th>Codigo palco</th><th>Un. por produto</th><th>Pecas por palco</th><th>Tempo corte un.</th><th>Tempo corte palco</th><th>Tempo montagem un.</th><th></th></tr></thead>
            <tbody>${structureRows(settings)}</tbody>
          </table>
        </div>
      </article>
    </section>

    <section class="settings-actions panel">
      <button class="button primary" data-action="save-settings"><i data-lucide="save"></i> Salvar configurações</button>
      <button class="button" data-action="reset-settings"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
      <span class="muted">Depois de salvar, todos os cards, gráficos, tabelas e a linha do tempo são recalculados.</span>
    </section>
    <div id="structure-choice-modal" class="modal-backdrop" hidden>
      <section class="modal-card">
        <div class="section-title">
          <div>
            <h2>Adicionar estrutura</h2>
            <p>Escolha o tipo de estrutura que deseja cadastrar.</p>
          </div>
        </div>
        <button class="button" type="button" data-action="add-simple-structure"><i data-lucide="plus"></i> Criar produto pronto</button>
        <button class="button" type="button" data-action="open-composite-structure"><i data-lucide="layers"></i> Criar produto formado por produtos prontos</button>
        <div class="modal-actions">
          <button class="button" type="button" data-action="close-structure-choice">Cancelar</button>
        </div>
      </section>
    </div>

    <div id="composite-structure-modal" class="modal-backdrop" hidden>
      <form class="modal-card modal-card-wide" id="composite-structure-form">
        <div class="section-title">
          <div>
            <h2>Produto composto</h2>
            <p>Monte o produto final usando produtos prontos ja cadastrados na estrutura.</p>
          </div>
        </div>
        <label>Produto final
          <input name="finalProduct" list="structure-product-options" placeholder="Nome do produto final" required>
        </label>
        <div class="responsive-table">
          <table class="settings-table composite-settings-table">
            <thead><tr><th>Produto pronto componente</th><th>Qtd por produto final</th><th></th></tr></thead>
            <tbody data-composite-components>
              <tr class="composite-component-row">
                <td><input name="componentProduct" list="composite-product-options" placeholder="Produto pronto" required></td>
                <td><input name="componentQuantity" type="number" min="0" step="0.01" value="1" required></td>
                <td><button class="button" type="button" data-action="remove-composite-component">Remover</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="button" type="button" data-action="add-composite-component"><i data-lucide="plus"></i> Produto componente</button>
        <div class="modal-actions">
          <button class="button primary" type="submit">Adicionar produto composto</button>
          <button class="button" type="button" data-action="close-composite-structure">Cancelar</button>
        </div>
      </form>
    </div>
  `;
}

export function mountSettings(onSave) {
  document.querySelector("[data-action='add-schedule']")?.addEventListener("click", () => {
    document.querySelector("#schedule-settings tbody")?.insertAdjacentHTML("beforeend", `
      <tr class="schedule-row">
        <td><input data-setting="employee" list="employee-options" placeholder="Funcionário"></td>
        <td><select data-setting="workType">${workTypeOptions("Montagem")}</select></td>
        <td><input data-setting="shift" placeholder="Turno"></td>
        <td><input type="time" data-setting="start" value="05:00"></td>
        <td><input type="time" data-setting="end" value="14:00"></td>
        <td><input type="time" data-setting="breakStart"></td>
        <td><input type="time" data-setting="breakEnd"></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `);
  });

  document.querySelector("[data-action='add-theory']")?.addEventListener("click", () => {
    document.querySelector("#theory-settings tbody")?.insertAdjacentHTML("beforeend", `
      <tr class="theory-row">
        <td><input data-setting="product" list="product-options" placeholder="Montagem"></td>
        <td><input data-setting="theoreticalUnitTime" placeholder="00:08:30"></td>
        <td><span class="muted">Novo cadastro</span></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `);
  });

  const choiceModal = document.getElementById("structure-choice-modal");
  const compositeModal = document.getElementById("composite-structure-modal");
  const closeChoiceModal = () => { if (choiceModal) choiceModal.hidden = true; };
  const closeCompositeModal = () => { if (compositeModal) compositeModal.hidden = true; };
  const componentRow = () => `
    <tr class="composite-component-row">
      <td><input name="componentProduct" list="composite-product-options" placeholder="Produto pronto" required></td>
      <td><input name="componentQuantity" type="number" min="0" step="0.01" value="1" required></td>
      <td><button class="button" type="button" data-action="remove-composite-component">Remover</button></td>
    </tr>
  `;

  document.querySelector("[data-action='add-structure']")?.addEventListener("click", () => {
    if (choiceModal) choiceModal.hidden = false;
  });
  document.querySelector("[data-action='close-structure-choice']")?.addEventListener("click", closeChoiceModal);
  document.querySelector("[data-action='add-simple-structure']")?.addEventListener("click", () => {
    document.querySelector("#structure-settings tbody")?.insertAdjacentHTML("beforeend", simpleStructureRow());
    closeChoiceModal();
  });
  document.querySelector("[data-action='open-composite-structure']")?.addEventListener("click", () => {
    closeChoiceModal();
    if (compositeModal) compositeModal.hidden = false;
  });
  document.querySelector("[data-action='close-composite-structure']")?.addEventListener("click", closeCompositeModal);
  document.querySelector("[data-action='add-composite-component']")?.addEventListener("click", () => {
    document.querySelector("[data-composite-components]")?.insertAdjacentHTML("beforeend", componentRow());
  });
  document.querySelector("[data-composite-components]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-composite-component']");
    if (!button) return;
    const rows = [...document.querySelectorAll(".composite-component-row")];
    if (rows.length === 1) {
      rows[0].querySelectorAll("input").forEach((input) => {
        input.value = input.name === "componentQuantity" ? "1" : "";
      });
      return;
    }
    button.closest("tr")?.remove();
  });
  document.getElementById("composite-structure-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const finalProduct = form.elements.finalProduct.value.trim().toUpperCase();
    const rows = [...form.querySelectorAll(".composite-component-row")]
      .map((row) => ({
        component: row.querySelector("[name='componentProduct']").value.trim().toUpperCase(),
        quantity: Number(row.querySelector("[name='componentQuantity']").value || 0)
      }))
      .filter((row) => row.component || row.quantity);
    if (!finalProduct || !rows.length || rows.some((row) => !row.component || !row.quantity)) {
      alert("Informe o produto final e todos os produtos prontos componentes com quantidade.");
      return;
    }
    const body = document.querySelector("#structure-settings tbody");
    rows.forEach((row) => {
      const inherited = productSummary(readStructureRowsFromDom(), row.component, row.quantity);
      body?.insertAdjacentHTML("beforeend", `
        <tr class="structure-row compound-structure-row">
        <td><input value="${finalProduct}" data-setting="product" list="structure-product-options"></td>
        <td><input value="${row.component}" data-setting="stage" list="structure-stage-options"></td>
        <td><input value="PRODUTO" data-setting="cutStageCode"></td>
        <td><input type="number" min="0" step="0.01" value="${row.quantity}" data-setting="unitsPerProduct"></td>
        <td><input type="number" min="0" step="0.01" value="${inherited.pieces || ""}" data-setting="piecesPerStage" readonly></td>
        <td><input value="${durationFromSeconds(inherited.cutUnitSeconds)}" data-setting="cutUnitTime" readonly></td>
        <td><input value="${durationFromSeconds(inherited.cutBatchSeconds)}" data-setting="cutBatchTime" readonly></td>
        <td><input value="${durationFromSeconds(inherited.assemblySeconds)}" data-setting="assemblyUnitTime" readonly></td>
        <td hidden><input value="compound" data-setting="structureKind"></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
      `);
    });
    refreshCompoundStructureRows();
    form.reset();
    form.querySelector("[data-composite-components]").innerHTML = componentRow();
    closeCompositeModal();
  });
  choiceModal?.addEventListener("click", (event) => {
    if (event.target.id === "structure-choice-modal") closeChoiceModal();
  });
  compositeModal?.addEventListener("click", (event) => {
    if (event.target.id === "composite-structure-modal") closeCompositeModal();
  });

  document.querySelectorAll("[data-action='remove-row']").forEach((button) => button.addEventListener("click", () => {
    button.closest("tr")?.remove();
  }));
  document.querySelectorAll(".settings-table tbody").forEach((tbody) => tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-row']");
    if (button) button.closest("tr")?.remove();
    refreshCompoundStructureRows();
  }));
  document.querySelector("#structure-settings tbody")?.addEventListener("input", refreshCompoundStructureRows);
  refreshCompoundStructureRows();

  document.querySelector("[data-action='save-settings']")?.addEventListener("click", () => {
    refreshCompoundStructureRows();
    const dataConnection = Object.fromEntries([...document.querySelectorAll("[data-connection]")].map((input) => [input.dataset.connection, input.value]));
    const secondaryDataConnection = Object.fromEntries([...document.querySelectorAll("[data-secondary-connection]")].map((input) => [input.dataset.secondaryConnection, input.value]));
    const planningConnection = Object.fromEntries([...document.querySelectorAll("[data-planning-connection]")].map((input) => [input.dataset.planningConnection, input.value]));
    const employeeSchedules = [...document.querySelectorAll(".schedule-row")].map(readRow);
    const theoreticalTimes = [...document.querySelectorAll(".theory-row")].map(readRow);
    const productStructures = [...document.querySelectorAll(".structure-row")].map(readRow);
    saveOperationalSettings({ dataConnection, secondaryDataConnection, planningConnection, employeeSchedules, theoreticalTimes, productStructures });
    onSave?.();
  });

  document.querySelector("[data-action='reset-settings']")?.addEventListener("click", () => {
    clearOperationalSettings();
    onSave?.();
  });
}

function readRow(row) {
  return Object.fromEntries([...row.querySelectorAll("[data-setting]")].map((input) => [input.dataset.setting, input.value]));
}
