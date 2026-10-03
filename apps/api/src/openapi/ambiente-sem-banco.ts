// Importado antes do AppModule pelo script de geração: o ConfigModule valida o ambiente quando o
// módulo é carregado. A URL e o segredo nunca são usados: a geração do documento não abre conexão
// nem assina tokens.
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:5432/openapi';
process.env.JWT_SECRET ??= 'segredo-usado-so-na-geracao-do-openapi';
