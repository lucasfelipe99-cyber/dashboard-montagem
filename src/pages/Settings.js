import { WORK_SCHEDULE } from "../config.js";
import { findEmployeeSchedule, loadOperationalSettings, saveOperationalSettings, clearOperationalSettings, formatSettingTime } from "../services/settingsService.js";
import { secondsToDuration } from "../utils/dateUtils.js";

function optionList(values, selected, placeholder) {
  return `<option value="">${placeholder}</option>${values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("")}`;
}

function workTypeOptions(selected = "Montagem") {
  return `
    <option value="Montagem" ${selected === "Montagem" ? "selected" : ""}>Montagem</option>
    <option value="Produção" ${selected === "Produção" ? "selected" : ""}>Produção</option>
  `;
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
  return settings.productStructures.map((item) => `
    <tr class="structure-row">
      <td><input value="${item.product}" data-setting="product" list="structure-product-options"></td>
      <td><input value="${item.stage}" data-setting="stage" list="structure-stage-options"></td>
      <td><input value="${item.cutStageCode || ""}" data-setting="cutStageCode" placeholder="P17"></td>
      <td><input type="number" min="0" step="0.01" value="${item.unitsPerProduct || ""}" data-setting="unitsPerProduct"></td>
      <td><input type="number" min="0" step="0.01" value="${item.piecesPerStage || ""}" data-setting="piecesPerStage"></td>
      <td><input value="${formatSettingTime(item.cutUnitTime) || item.cutUnitTime || ""}" data-setting="cutUnitTime" placeholder="00:00:47"></td>
      <td><input value="${formatSettingTime(item.cutBatchTime) || item.cutBatchTime || ""}" data-setting="cutBatchTime" placeholder="00:38:44"></td>
      <td><input value="${formatSettingTime(item.assemblyUnitTime) || item.assemblyUnitTime || ""}" data-setting="assemblyUnitTime" placeholder="00:05:00"></td>
      <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
    </tr>
  `).join("");
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
            <thead><tr><th>Produto pronto</th><th>Palco / item de corte</th><th>Codigo palco</th><th>Un. por produto</th><th>Pecas por palco</th><th>Tempo corte un.</th><th>Tempo corte palco</th><th>Tempo montagem un.</th><th></th></tr></thead>
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

  document.querySelector("[data-action='add-structure']")?.addEventListener("click", () => {
    document.querySelector("#structure-settings tbody")?.insertAdjacentHTML("beforeend", `
      <tr class="structure-row">
        <td><input data-setting="product" list="structure-product-options" placeholder="Produto pronto"></td>
        <td><input data-setting="stage" list="structure-stage-options" placeholder="Palco / item de corte"></td>
        <td><input data-setting="cutStageCode" placeholder="P17"></td>
        <td><input type="number" min="0" step="0.01" data-setting="unitsPerProduct" placeholder="1"></td>
        <td><input type="number" min="0" step="0.01" data-setting="piecesPerStage" placeholder="88"></td>
        <td><input data-setting="cutUnitTime" placeholder="00:00:47"></td>
        <td><input data-setting="cutBatchTime" placeholder="00:38:44"></td>
        <td><input data-setting="assemblyUnitTime" placeholder="00:05:00"></td>
        <td><button class="icon-button danger" data-action="remove-row" aria-label="Remover linha"><i data-lucide="trash-2"></i></button></td>
      </tr>
    `);
  });

  document.querySelectorAll("[data-action='remove-row']").forEach((button) => button.addEventListener("click", () => {
    button.closest("tr")?.remove();
  }));
  document.querySelectorAll(".settings-table tbody").forEach((tbody) => tbody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-row']");
    if (button) button.closest("tr")?.remove();
  }));

  document.querySelector("[data-action='save-settings']")?.addEventListener("click", () => {
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
