import { TOTAL_HISTORICO } from './config.js';

/**
 * Estima la probabilidad de obtener un destino concreto comparando la
 * posición relativa del usuario este año con la franja equivalente de
 * posiciones en la resolución real de la 49ª Promoción.
 *
 * Es una estimación estadística simple (frecuencia empírica en una ventana
 * de puestos histórica), no una proyección oficial.
 */
export function probabilidadDestino(posicionActual, totalActual, destinoId, historico) {
  if (!totalActual || totalActual <= 0) return { pct: 0, n: 0, desde: 0, hasta: 0 };

  const rankEscalado = Math.min(
    TOTAL_HISTORICO,
    Math.max(1, Math.round((posicionActual / totalActual) * TOTAL_HISTORICO))
  );
  const ventana = Math.max(8, Math.round(TOTAL_HISTORICO * 0.05));
  const desde = Math.max(1, rankEscalado - ventana);
  const hasta = Math.min(TOTAL_HISTORICO, rankEscalado + ventana);

  const grupo = historico.filter(h => h.rank >= desde && h.rank <= hasta);
  if (grupo.length === 0) return { pct: 0, n: 0, desde, hasta };

  const conseguido = grupo.filter(h => h.destino === destinoId).length;
  return { pct: Math.round((conseguido / grupo.length) * 100), n: grupo.length, desde, hasta };
}
