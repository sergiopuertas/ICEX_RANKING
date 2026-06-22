// ============================================================================
// CONFIGURACIÓN — rellena esto tras crear tu proyecto en supabase.com
// Project Settings > API > Project URL / anon public key
// ============================================================================
export const SUPABASE_URL = "https://cidldsjquptxfeeqlpoo.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpZGxkc2pxdXB0eGZlZXFscG9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjc2NTUsImV4cCI6MjA5NzcwMzY1NX0.YXM0EDzXH-VM0x2_dA4pQXvCfHExqf2LpNPz1tJRTao";

// Pesos del baremo (deben coincidir con el generated column de schema.sql)
export const PESOS = { master: 0.85, idioma: 0.10, tics: 0.05 };
export const CREDITOS = { total: 60, tfm: 7, conocidos: 53 };

export const PUNTOS_TFM = { apto: 100, suspenso: 0, pendiente: 0 };
export const PUNTOS_IDIOMA = { ninguno: 0, b2: 50, c1: 75, c2: 100 };

export const MIN_PREFERENCIAS = 5;
export const MAX_PREFERENCIAS = 15;

// Total de personas con nota en el histórico de la 49ª promoción (282),
// usado para escalar el percentil del usuario actual al ranking histórico.
export const TOTAL_HISTORICO = 282;
