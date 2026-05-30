# Archive: easy-rag — Inicialización del Template

## Summary
- **Proposal:** `.sdd/changes/inicial/proposal.md`
- **Spec:** `.sdd/changes/inicial/spec.md`
- **Design:** `.sdd/changes/inicial/design.md`
- **Tasks:** 8 tasks, 8 AFK + 0 HITL
- **Verification:** PASS

## Files Changed
- `package.json` — proyecto NestJS 11 con AI SDK, LangChain, pg, zod
- `tsconfig.json` — strict mode, ES2022, decorators
- `nest-cli.json` — tsc builder
- `src/main.ts` — bootstrap con CORS, puerto configurable
- `src/app.module.ts` — módulo raíz con ConfigModule, AiModule, VectorStoreModule, RagModule
- `src/config/*` — Zod schema, ConfigService, ConfigModule (13 env vars)
- `src/ai/*` — AiModule + AiService (generateText, streamText, embed)
- `src/embeddings/*` — EmbeddingsModule + DefaultEmbeddingsService
- `src/vector-store/*` — VectorStoreModule + PgVectorService con pg Pool
- `src/rag/*` — RagModule + RagService + RagController + IngestionService
- `src/rag/ingestion/*` — Ingestion pipeline con LangChain text splitter
- `docker-compose.yml` — pgvector/pgvector:pg16
- `.env.example` — todas las env vars con defaults
- `README.md` — portada del proyecto
- `CONTEXT.md` — lenguaje compartido del dominio
- `docs/*` — quickstart, rag-pipeline, adding-a-provider, vector-store, api-reference

## ADRs Created
- ADR-001: Vercel AI SDK como orquestador principal
- ADR-002: LangChain solo para componentes RAG (via @ai-sdk/langchain)
- ADR-003: pgvector sin ORM
- ADR-004: DeepSeek via OpenAI-compatible API
- ADR-005: Módulos por dominio, no por capas técnicas
- ADR-006: Zod para validación de configuración

## CONTEXT.md Updates
- Creado CONTEXT.md con definiciones del dominio RAG

## What Was Learned
- Vercel AI SDK v6 tiene API funcional moderna, streaming nativo, pero no tiene componentes RAG (retrievers, splitters, document loaders)
- LangChain tiene ecosistema RAG maduro pero API verbosa
- El patrón híbrido (AI SDK + LangChain via `@ai-sdk/langchain`) ofrece lo mejor de ambos mundos
- pgvector es simple de configurar en Docker y no requiere dependencias externas
- SSE streaming desde NestJS requiere manejo manual de Response con @Res()
- Los ACP subagentes de opencode son excelentes para implementación pero se cuelgan en tareas muy complejas o lentas

## Next Steps
- Agregar tests e2e con supertest para RagController
- Agregar retry logic personalizado para DeepSeek API
- Considerar agregar OpenAI y Anthropic como providers adicionales (la interfaz ya está lista)
- Agregar GitHub Actions CI
