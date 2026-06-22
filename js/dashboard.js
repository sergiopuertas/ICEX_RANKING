import { supabase } from './supabaseClient.js';
import { formatoNota } from './scoring.js';
import { probabilidadDestino } from './probabilidad.js';

let DESTINOS = [];
let DESTINOS_BY_ID = {};
let HISTORICO = [];
let ENTRIES = [];
let ASIGNACION = {};
let DEMANDA = {};
let map, layerGroup;
let openRowId = null;
let refreshTimer = null;

const COLORS = { low: '#2E8B57', mid: '#B8791E', high: '#B23A32' };

// ----------------------------------------------------------------------------
// Carga de datos
// ----------------------------------------------------------------------------
async function cargarEstaticos() {
  const [resD, resH] = await Promise.all([fetch('data/destinos.json'), fetch('data/historico.json')]);
  DESTINOS = await resD.json();
  HISTORICO = await resH.json();
  DESTINOS_BY_ID = Object.fromEntries(DESTINOS.map(d => [d.id, d]));
}

async function cargarRanking() {
  const { data, error } = await supabase.from('ranking').select('*').order('posicion', { ascending: true });
  if (error) throw error;
  ENTRIES = data || [];
}

// ----------------------------------------------------------------------------
// Simulación de asignación (reparto en orden de nota, con las plazas de la 49ª)
// y demanda en bruto por destino
// ----------------------------------------------------------------------------
function simular() {
  const restante = {};
  DESTINOS.forEach(d => { restante[d.id] = d.plazas_2025; });
  ASIGNACION = {};
  ENTRIES.forEach(e => {
    let elegido = null;
    for (const prefId of e.preferences || []) {
      if ((restante[prefId] ?? 0) > 0) { elegido = prefId; restante[prefId]--; break; }
    }
    ASIGNACION[e.id] = elegido;
  });

  DEMANDA = {};
  DESTINOS.forEach(d => { DEMANDA[d.id] = 0; });
  ENTRIES.forEach(e => {
    (e.preferences || []).forEach(prefId => {
      if (DEMANDA[prefId] !== undefined) DEMANDA[prefId]++;
    });
  });
}

function tierDestino(id) {
  const plazas = DESTINOS_BY_ID[id]?.plazas_2025 || 0;
  const demanda = DEMANDA[id] || 0;
  if (!plazas) return 'mid';
  const ratio = demanda / plazas;
  if (ratio > 1) return 'high';
  if (ratio > 0.7) return 'mid';
  return 'low';
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------
function renderStats() {
  const row = document.getElementById('stats-row');
  const sobredemandados = DESTINOS.filter(d => tierDestino(d.id) === 'high').length;
  row.children[0].innerHTML = `<div class="v">${ENTRIES.length}</div><div class="l">Inscritos</div>`;
  row.children[2].innerHTML = `<div class="v" style="color:${ENTRIES.length ? 'var(--danger)' : 'var(--ink)'}">${sobredemandados}</div><div class="l">Destinos sobredemandados</div>`;
  document.getElementById('stat-updated').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ----------------------------------------------------------------------------
// Mapa
// ----------------------------------------------------------------------------
function initMap() {
  map = L.map('map', { worldCopyJump: true, scrollWheelZoom: false }).setView([20, 10], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    maxZoom: 18,
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);
}

function renderMap() {
  layerGroup.clearLayers();
  DESTINOS.forEach(d => {
    const tier = tierDestino(d.id);
    const demanda = DEMANDA[d.id] || 0;
    const radius = 6 + Math.sqrt(d.plazas_2025) * 3.2;
    const marker = L.circleMarker([d.lat, d.lon], {
      radius, color: COLORS[tier], weight: 1.5, fillColor: COLORS[tier], fillOpacity: 0.45,
    });
    marker.bindPopup(`
      <strong>${d.ciudad}</strong> · ${d.pais}<br>
      ${d.organismo}<br>
      ${d.plazas_2025} plaza${d.plazas_2025 === 1 ? '' : 's'} (49ª) · ${demanda} solicitud${demanda === 1 ? '' : 'es'} este año
    `);
    marker.addTo(layerGroup);
  });
}

// ----------------------------------------------------------------------------
// Tabla
// ----------------------------------------------------------------------------
function relativo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours <= 0) return 'ahora';
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days}d`;
}

function nombreDestino(id) {
  const d = DESTINOS_BY_ID[id];
  return d ? `${d.ciudad}` : id;
}

function chipsHtml(prefs) {
  const visibles = prefs.slice(0, 5);
  let html = visibles.map((id, i) => `<span class="chip${i === 0 ? ' first' : ''}">${nombreDestino(id)}</span>`).join('');
  if (prefs.length > 5) html += `<span class="chip">+${prefs.length - 5}</span>`;
  return `<div class="chips">${html}</div>`;
}

function probCardHtml(prefId, posicion) {
  const d = DESTINOS_BY_ID[prefId];
  const { pct, n, desde, hasta } = probabilidadDestino(posicion, ENTRIES.length, prefId, HISTORICO);
  const color = pct >= 50 ? 'var(--success)' : pct >= 20 ? 'var(--warning)' : 'var(--danger)';
  return `
    <div class="prob-card">
      <div class="dest">${d ? d.ciudad : prefId}</div>
      <div class="prob-ring-row"><span class="prob-pct" style="color:${color}">${pct}%</span></div>
      <div class="prob-note">De ${n} personas que en la 49ª Promoción quedaron entre los puestos ${desde}–${hasta} (sobre ${282}), un ${pct}% acabó en este destino.</div>
    </div>`;
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const q = document.getElementById('search-alias').value.trim().toLowerCase();
  const myAlias = (localStorage.getItem('icex_alias') || '').toLowerCase();

  const filtradas = ENTRIES.filter(e => !q || e.alias.toLowerCase().includes(q));
  document.getElementById('result-count').textContent = q ? `${filtradas.length} de ${ENTRIES.length}` : '';

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${ENTRIES.length === 0 ? 'Todavía no hay nadie inscrito. ¡Sé el primero desde "Mi puesto"!' : 'Sin resultados para esa búsqueda.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(e => {
    const isMe = myAlias && e.alias.toLowerCase() === myAlias;
    const destinoEst = ASIGNACION[e.id];
    const destinoHtml = destinoEst
      ? `<span class="demand-pill ${tierDestino(destinoEst)}">${nombreDestino(destinoEst)}</span>`
      : `<span style="color:var(--ink-faint);font-size:12.5px;">Sin plaza estimada</span>`;
    const top3 = (e.preferences || []).slice(0, 3);
    return `
      <tr class="row-main ${isMe ? 'is-me' : ''}" data-id="${e.id}">
        <td><span class="pos-badge">#${e.posicion}</span></td>
        <td class="alias-cell">${e.alias}${isMe ? '<span class="you-tag">TÚ</span>' : ''}</td>
        <td class="num">${formatoNota(e.final_score)}</td>
        <td>${chipsHtml(e.preferences || [])}</td>
        <td>${destinoHtml}</td>
        <td style="color:var(--ink-faint);font-size:12.5px;">${relativo(e.updated_at)}</td>
      </tr>
      <tr class="row-detail" id="detail-${e.id}">
        <td colspan="6">
          <div style="font-size:12.5px;color:var(--ink-soft);font-weight:700;margin-bottom:10px;">
            Probabilidad estimada de conseguir tus 3 primeras preferencias
          </div>
          <div class="prob-grid">${top3.map(id => probCardHtml(id, e.posicion)).join('')}</div>
        </td>
      </tr>`;
  }).join('');

  if (openRowId && document.getElementById(`detail-${openRowId}`)) {
    document.getElementById(`detail-${openRowId}`).classList.add('open');
  }
}

document.getElementById('table-body').addEventListener('click', (e) => {
  const row = e.target.closest('tr.row-main');
  if (!row) return;
  const id = row.dataset.id;
  document.querySelectorAll('.row-detail.open').forEach(r => r.classList.remove('open'));
  if (openRowId === id) { openRowId = null; return; }
  openRowId = id;
  document.getElementById(`detail-${id}`)?.classList.add('open');
});

document.getElementById('search-alias').addEventListener('input', renderTable);

// ----------------------------------------------------------------------------
// Ciclo de carga / refresco
// ----------------------------------------------------------------------------
async function refrescarTodo() {
  try {
    await cargarRanking();
    simular();
    renderStats();
    renderMap();
    renderTable();
  } catch (err) {
    document.getElementById('table-body').innerHTML =
      `<tr><td colspan="6" class="empty-state">No se ha podido conectar con la base de datos. Revisa js/config.js.<br><span style="font-size:12px">${err.message || ''}</span></td></tr>`;
  }
}

document.getElementById('btn-refresh').addEventListener('click', refrescarTodo);

(async function init() {
  await cargarEstaticos();
  initMap();
  await refrescarTodo();
  refreshTimer = setInterval(refrescarTodo, 30000);
})();
