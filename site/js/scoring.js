import { PESOS, CREDITOS, PUNTOS_TFM, PUNTOS_IDIOMA } from './config.js';

/**
 * Calcula la nota final sobre 100 con el mismo criterio que el generated
 * column de Postgres (schema.sql), para que la previsualización en el
 * formulario coincida exactamente con lo que guardará la base de datos.
 */
export function calcularNotaFinal({ notaMaster, tfm, idioma, tics }) {
  const puntosTfm = PUNTOS_TFM[tfm] ?? 0;
  const notaMasterTotal =
    (notaMaster * CREDITOS.conocidos + puntosTfm * CREDITOS.tfm) / CREDITOS.total;
  const puntosIdioma = PUNTOS_IDIOMA[idioma] ?? 0;
  const final =
    PESOS.master * notaMasterTotal + PESOS.idioma * puntosIdioma + PESOS.tics * tics;
  return Math.round(final * 1000) / 1000;
}

export function formatoNota(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toFixed(2);
}
