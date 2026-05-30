# Proposal: easy-rag — NestJS Template para Orquestación RAG

## Intent
Template profesional en NestJS para orquestar pipelines RAG usando Vercel AI SDK como orquestador principal + LangChain para componentes RAG, con pgvector como vector store y DeepSeek como LLM provider.

## Scope
### In
- [ ] Proyecto NestJS base con estructura modular
- [ ] Integración con Vercel AI SDK (core de orquestación)
- [ ] Integración con LangChain (solo text splitters, document loaders)
- [ ] pgvector via Docker Compose (PostgreSQL + vector extension)
- [ ] DeepSeek como LLM provider (via @ai-sdk/openai con base URL custom o @ai-sdk/deepseek)
- [ ] Módulo abstracto de embeddings (interfaz + implementación DeepSeek/OpenAI)
- [ ] Módulo abstracto de vector store (interfaz + implementación pgvector)
- [ ] Servicio RAG core (document ingestion + query pipeline)
- [ ] API REST endpoints (ingest, query, health)
- [ ] Docker Compose para pgvector
- [ ] Tests con Jest (unitarios + integración)
- [ ] Documentación básica (README, CONTEXT.md)

### In (docs)
- [ ] `docs/quickstart.md` — cómo levantar el proyecto
- [ ] `docs/rag-pipeline.md` — explicación del pipeline RAG
- [ ] `docs/adding-a-provider.md` — cómo agregar un nuevo LLM provider
- [ ] `docs/vector-store.md` — configuración de pgvector
- [ ] `docs/api-reference.md` — referencia de endpoints

### Out
- [ ] Ejemplos completos de RAG con UI (e.g., "chat with PDF")
- [ ] Frontend/UI
- [ ] Autenticación/autorización
- [ ] Rate limiting
- [ ] Monitoreo/observabilidad (solo lo básico)
- [ ] Providers adicionales (OpenAI, Anthropic, Google — solo interfaz abstracta)
- [ ] Caching distribuido
- [ ] Streaming a WebSocket (solo SSE por ahora)

## Approach
### Arquitectura General
```
easy-rag/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/              # Configuración centralizada (env vars)
│   ├── ai/                   # Módulo AI SDK core
│   │   ├── ai.module.ts
│   │   ├── ai.service.ts     # Wrapper sobre Vercel AI SDK
│   │   └── providers/        # Factory de providers LLM
│   ├── rag/                  # Módulo RAG
│   │   ├── rag.module.ts
│   │   ├── rag.service.ts    # Pipeline RAG principal
│   │   ├── ingestion/        # Ingesta de documentos
│   │   ├── retrieval/        # Estrategias de retrieval
│   │   └── interfaces/       # Interfaces RAG
│   ├── embeddings/           # Módulo de embeddings
│   │   ├── embeddings.module.ts
│   │   ├── embeddings.service.ts
│   │   └── interfaces/
│   ├── vector-store/         # Módulo de vector store
│   │   ├── vector-store.module.ts
│   │   ├── pgvector.service.ts
│   │   └── interfaces/
│   └── common/               # shared utilities
├── docker-compose.yml        # pgvector + infra
├── .env.example
├── jest.config.ts
└── package.json
```

### Stack Técnico
- **Runtime:** Node.js 22+
- **Framework:** NestJS 11
- **Package Manager:** pnpm
- **Lenguaje:** TypeScript 5.x (strict mode)
- **Orquestación AI:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/langchain`)
- **Componentes RAG:** LangChain (`@langchain/textsplitters`, `@langchain/community`)
- **Vector Store:** pgvector (PostgreSQL 16 + vector extension)
- **DB Client:** `pg` (node-postgres) con Pool
- **LLM:** DeepSeek (API compatible OpenAI vía base URL custom)
- **Testing:** Jest + supertest (e2e)
- **Validación:** Zod + class-validator
- **Docker:** Docker Compose para pgvector

## Modules Affected
- Proyecto nuevo — no hay módulos existentes

## Risks
- pgvector requiere Docker → dependencia de Docker en dev
- DeepSeek API puede tener rate limits → incluir retry logic
- AI SDK + LangChain juntos aumentan peso de dependencias → pero justificado por flexibilidad
- Versiones futuras de AI SDK/LangChain pueden romper compatibilidad → usar peer dependencies

## Skill Resolution
- skills sugeridos: opencode (para implementar en paralelo), tdd (para tests)
