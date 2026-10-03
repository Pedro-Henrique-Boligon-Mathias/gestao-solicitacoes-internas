// O ConfigModule valida o ambiente quando o AppModule é importado, então os valores de teste
// precisam existir antes de qualquer import. Variáveis já definidas têm prioridade sobre o .env.
process.env.DATABASE_URL = 'postgresql://teste:teste@localhost:5432/teste';
process.env.LOG_LEVEL = 'silent';
