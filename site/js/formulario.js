import { supabase } from './supabaseClient.js';
import { calcularNotaFinal, formatoNota } from './scoring.js';
import { MIN_PREFERENCIAS, MAX_PREFERENCIAS } from './config.js';

const banner = document.getElementById('banner');
function showBanner(msg, type = 'ok') {
  banner.textContent = msg;
  banner.className = `banner show ${type}`;
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideBanner() { banner.className = 'banner'; }

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let DESTINOS = [];
let preferencias = []; // array de objetos destino, en orden
let editing = null;    // { alias, pin } si estamos en modo edición

// ----------------------------------------------------------------------------
// Carga de destinos
// ----------------------------------------------------------------------------
async function cargarDestinos() {
  const res = await fetch('data/destinos.json');
  DESTINOS = await res.json();
}

// ----------------------------------------------------------------------------
// Buscador / combobox
// ----------------------------------------------------------------------------
const destSearch = document.getElementById('dest-search');
const destResults = document.getElementById('dest-results');

function renderResultados(query) {
  const q = norm(query);
  const yaElegidos = new Set(preferencias.map(d => d.id));
  let candidatos = DESTINOS.filter(d => !yaElegidos.has(d.id));
  if (q.length > 0) {
    candidatos = candidatos.filter(d => norm(d.ciudad).includes(q) || norm(d.pais).includes(q));
  }
  candidatos = candidatos.slice(0, 8);

  if (candidatos.length === 0) {
    destResults.innerHTML = `<div class="combo-item" style="color:var(--ink-faint);cursor:default">Sin resultados</div>`;
  } else {
    destResults.innerHTML = candidatos.map((d, i) => `
      <div class="combo-item${i === 0 ? ' focused' : ''}" data-id="${d.id}">
        <span>${d.ciudad} <span class="meta">${d.pais}</span></span>
        <span class="meta">${d.plazas_2025} plaza${d.plazas_2025 === 1 ? '' : 's'} (49ª)</span>
      </div>`).join('');
  }
  destResults.classList.add('open');
}

destSearch.addEventListener('focus', () => renderResultados(destSearch.value));
destSearch.addEventListener('input', () => renderResultados(destSearch.value));
document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo')) destResults.classList.remove('open');
});
destResults.addEventListener('click', (e) => {
  const item = e.target.closest('.combo-item[data-id]');
  if (!item) return;
  agregarPreferencia(item.dataset.id);
});
destSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = destResults.querySelector('.combo-item[data-id]');
    if (first) agregarPreferencia(first.dataset.id);
  }
});

function agregarPreferencia(id) {
  if (preferencias.length >= MAX_PREFERENCIAS) {
    showBanner(`Ya tienes el máximo de ${MAX_PREFERENCIAS} destinos.`, 'error');
    return;
  }
  const destino = DESTINOS.find(d => d.id === id);
  if (!destino || preferencias.some(d => d.id === id)) return;
  preferencias.push(destino);
  destSearch.value = '';
  renderResultados('');
  renderPreferencias();
}

function renderPreferencias() {
  const list = document.getElementById('pref-list');
  list.innerHTML = preferencias.map((d, i) => `
    <li class="pref-item" data-id="${d.id}">
      <span class="rank-no">${i + 1}</span>
      <span class="name">${d.ciudad}<span class="country">${d.pais}</span></span>
      <span class="ctrls">
        <button type="button" class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button type="button" class="icon-btn" data-act="down" ${i === preferencias.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
        <button type="button" class="icon-btn remove" data-act="del" title="Quitar">✕</button>
      </span>
    </li>`).join('');

  const count = document.getElementById('pref-count');
  const n = preferencias.length;
  count.textContent = `${n} destino${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'} (entre ${MIN_PREFERENCIAS} y ${MAX_PREFERENCIAS})`;
  count.className = n < MIN_PREFERENCIAS ? 'pref-count warn' : 'pref-count';
}

document.getElementById('pref-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const li = btn.closest('.pref-item');
  const id = li.dataset.id;
  const idx = preferencias.findIndex(d => d.id === id);
  if (btn.dataset.act === 'del') preferencias.splice(idx, 1);
  if (btn.dataset.act === 'up' && idx > 0) [preferencias[idx - 1], preferencias[idx]] = [preferencias[idx], preferencias[idx - 1]];
  if (btn.dataset.act === 'down' && idx < preferencias.length - 1) [preferencias[idx + 1], preferencias[idx]] = [preferencias[idx], preferencias[idx + 1]];
  renderPreferencias();
});

// ----------------------------------------------------------------------------
// Preview de nota en vivo
// ----------------------------------------------------------------------------
const inputsNota = ['master-grade', 'tfm', 'idioma', 'tics-grade'];
function actualizarPreview() {
  const notaMaster = parseFloat(document.getElementById('master-grade').value);
  const tics = parseFloat(document.getElementById('tics-grade').value);
  const tfm = document.getElementById('tfm').value;
  const idioma = document.getElementById('idioma').value;
  const el = document.getElementById('preview-score');
  if (Number.isNaN(notaMaster) || Number.isNaN(tics)) { el.textContent = '—'; return; }
  const nota = calcularNotaFinal({ notaMaster, tfm, idioma, tics });
  el.textContent = formatoNota(nota);
}
inputsNota.forEach(id => document.getElementById(id).addEventListener('input', actualizarPreview));

// ----------------------------------------------------------------------------
// Generador de alias aleatorio (si el usuario no pone uno)
// ----------------------------------------------------------------------------
function aliasAleatorio() {
  const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Becario-${sufijo}`;
}

// ----------------------------------------------------------------------------
// Envío del formulario (alta o edición)
// ----------------------------------------------------------------------------
const form = document.getElementById('form-entry');
const btnSubmit = document.getElementById('btn-submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const aliasInput = document.getElementById('alias').value.trim();
  const pin = document.getElementById('pin').value;
  const notaMaster = parseFloat(document.getElementById('master-grade').value);
  const tfm = document.getElementById('tfm').value;
  const idioma = document.getElementById('idioma').value;
  const tics = parseFloat(document.getElementById('tics-grade').value);

  if (pin.length < 4) return showBanner('El código personal debe tener al menos 4 caracteres.', 'error');
  if (Number.isNaN(notaMaster) || notaMaster < 0 || notaMaster > 100) return showBanner('Revisa la nota del máster (0–100).', 'error');
  if (Number.isNaN(tics) || tics < 0 || tics > 100) return showBanner('Revisa la nota de TICs (0–100).', 'error');
  if (preferencias.length < MIN_PREFERENCIAS) return showBanner(`Indica al menos ${MIN_PREFERENCIAS} destinos.`, 'error');

  const destinosIds = preferencias.map(d => d.id);
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Guardando…';

  try {
    if (editing) {
      const { error } = await supabase.rpc('update_entry', {
        p_alias: editing.alias,
        p_pin: editing.pin,
        p_new_alias: aliasInput || null,
        p_master_grade: notaMaster,
        p_tfm: tfm,
        p_lang: idioma,
        p_tics: tics,
        p_preferences: destinosIds,
      });
      if (error) throw error;
      showBanner('Tus datos se han actualizado correctamente.', 'ok');
      localStorage.setItem('icex_alias', aliasInput || editing.alias);
    } else {
      const aliasFinal = aliasInput || aliasAleatorio();
      const { error } = await supabase.rpc('create_entry', {
        p_alias: aliasFinal,
        p_pin: pin,
        p_master_grade: notaMaster,
        p_tfm: tfm,
        p_lang: idioma,
        p_tics: tics,
        p_preferences: destinosIds,
      });
      if (error) throw error;
      document.getElementById('alias').value = aliasFinal;
      localStorage.setItem('icex_alias', aliasFinal);
      showBanner(`Hecho. Tu alias es "${aliasFinal}" — guárdalo junto a tu código personal para poder editarte o eliminarte más adelante.`, 'ok');
    }
  } catch (err) {
    showBanner(err.message || 'No se ha podido guardar. Inténtalo de nuevo.', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Guardar mi puesto en el ranking';
  }
});

// ----------------------------------------------------------------------------
// Cargar / eliminar entrada existente
// ----------------------------------------------------------------------------
document.getElementById('btn-load').addEventListener('click', async () => {
  hideBanner();
  const alias = document.getElementById('manage-alias').value.trim();
  const pin = document.getElementById('manage-pin').value;
  if (!alias || !pin) return showBanner('Indica tu alias y tu código personal.', 'error');

  const { data, error } = await supabase.rpc('get_my_entry', { p_alias: alias, p_pin: pin });
  if (error || !data || data.length === 0) return showBanner('No se ha encontrado ninguna entrada con ese alias y código.', 'error');

  const e = data[0];
  document.getElementById('alias').value = e.alias;
  document.getElementById('master-grade').value = e.master_grade_known;
  document.getElementById('tfm').value = e.tfm_status;
  document.getElementById('idioma').value = e.language_level;
  document.getElementById('tics-grade').value = e.tics_grade;
  preferencias = (e.preferences || []).map(id => DESTINOS.find(d => d.id === id)).filter(Boolean);
  renderPreferencias();
  actualizarPreview();
  editing = { alias, pin };
  btnSubmit.textContent = 'Actualizar mis datos';
  showBanner('Datos cargados. Modifica lo que necesites y pulsa "Actualizar mis datos".', 'ok');
  document.getElementById('form-entry').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  hideBanner();
  const alias = document.getElementById('manage-alias').value.trim();
  const pin = document.getElementById('manage-pin').value;
  if (!alias || !pin) return showBanner('Indica tu alias y tu código personal.', 'error');
  if (!confirm('Esto eliminará tu entrada del ranking de forma permanente. ¿Continuar?')) return;

  const { error } = await supabase.rpc('delete_entry', { p_alias: alias, p_pin: pin });
  if (error) return showBanner('No se ha encontrado ninguna entrada con ese alias y código.', 'error');

  showBanner('Tu entrada se ha eliminado del ranking.', 'ok');
  form.reset();
  preferencias = [];
  editing = null;
  renderPreferencias();
  actualizarPreview();
  btnSubmit.textContent = 'Guardar mi puesto en el ranking';
});

// ----------------------------------------------------------------------------
// Init
// ----------------------------------------------------------------------------
(async function init() {
  await cargarDestinos();
  renderPreferencias();
  const savedAlias = localStorage.getItem('icex_alias');
  if (savedAlias) document.getElementById('manage-alias').value = savedAlias;
})();
