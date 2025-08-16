# RAG API

A REST API for document processing and retrieval-augmented generation (RAG) using OpenAI embeddings and Pinecone vector database.

## Features

- **PDF Processing**: Upload PDFs from URLs with optional page deletion
- **Document Chunking**: Automatic text splitting for optimal embedding
- **Vector Storage**: Pinecone cloud vector database for scalable storage
- **Semantic Search**: Find relevant documents using similarity search
- **RAG Chat**: AI-powered chat with document context using OpenAI GPT

## API Endpoints

### Health Check
```
GET /health
```

### Upload PDF
```
POST /upload
Content-Type: application/json

{
  "paperUrl": "https://example.com/document.pdf",
  "name": "Document Name",
  "pagesToDelete": [1, 2] // optional
}
```

### Chat with Documents
```
POST /chat
Content-Type: application/json

{
  "message": "Explain the main concepts",
  "k": 4 // number of context documents, optional
}
```

## Environment Variables

```env
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_index_name
PORT=3001
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env` file

3. Run development server:
```bash
npm run dev
```

## Deployment

### Docker
```bash
docker build -t rag-api .
docker run -p 3001:3001 --env-file .env rag-api
```

### AWS App Runner
1. Push code to GitHub
2. Create App Runner service
3. Connect GitHub repository
4. Configure environment variables
5. Deploy automatically

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **AI/ML**: OpenAI GPT-4, OpenAI Embeddings
- **Vector DB**: Pinecone
- **Document Processing**: LangChain, PDF-lib
- **Deployment**: Docker, AWS App Runner