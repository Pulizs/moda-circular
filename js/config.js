// Configuração do Supabase.
// A chave "publishable" é pública por natureza: a segurança dos dados vem das
// regras de Row Level Security definidas em supabase/schema.sql.
export const SUPABASE_URL = 'https://jjzaekfiegsjkpycvugy.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_f4Sp7nbtjthhMEY1HR35-Q_1UnyvSOj';

export const CATEGORIAS = [
  'Blusas e camisetas', 'Camisas', 'Calças', 'Shorts e saias', 'Vestidos',
  'Casacos e jaquetas', 'Moletons', 'Calçados', 'Bolsas e acessórios', 'Outros'
];
export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único', '34', '36', '38', '40', '42', '44', '46', '48'];
export const CONDICOES = { nova: 'Nova', seminova: 'Seminova', usada: 'Usada' };
