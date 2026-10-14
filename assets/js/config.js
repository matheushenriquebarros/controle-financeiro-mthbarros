/* =====================================================================
   Conexão com o Supabase — o MESMO projeto do painel de divisão de
   lucros (cataaxflvzrbqebqrokm). As tabelas do controle começam com
   "fin_" e não encostam nas do painel; o login é o mesmo.
   A chave "publishable" (anon public) pode ficar aqui: quem protege os
   dados são as regras de RLS do database/schema.sql.
   NUNCA coloque a "service_role" / "sb_secret_…".
   ===================================================================== */
window.MB_CONFIG = {
  supabaseUrl: "https://cataaxflvzrbqebqrokm.supabase.co",
  supabaseChave: "sb_publishable_Zj3t8Xi8G4QHJloM2BM8zw_hrxsYOG0"
};
