/**
 * env.js — Configuração de ambiente para o frontend
 * Portal ANS / Finvest Dashboard
 *
 * Este arquivo contém apenas as variáveis PÚBLICAS (seguras para o cliente).
 * Substitua os valores abaixo com suas credenciais do Supabase.
 *
 * ⚠️  NUNCA coloque aqui: service_role key, senhas SMTP, segredos OAuth.
 * ⚠️  Se usar git, adicione este arquivo ao .gitignore se quiser.
 *     A anon key do Supabase é protegida por RLS — pode ficar no código.
 */

window.__ENV = {
  SUPABASE_URL: 'https://tiinebyrdybfkavrvqiy.supabase.co',   // ← substitua
  SUPABASE_ANON_KEY: 'sb_publishable_M5Msp5Ej9CarUaKGxywv3A_GQEGzhLZ',            // ← substitua
};
