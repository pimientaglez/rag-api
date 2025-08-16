import axios from "axios";
import { PDFDocument } from "pdf-lib";
import { Document } from "langchain/document";
import { writeFile, unlink } from "fs/promises";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PineconeStore } from "@langchain/community/vectorstores/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import express from "express";
import "dotenv/config";
// Global vector store
let vectorStore: PineconeStore | null = null;
let pinecone: Pinecone | null = null;

async function deletePages(
  pdf: Buffer,
  pagesToDelete: number[]
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdf);
  let numToOffsetBy = 1;
  for (const pageIndex of pagesToDelete) {
    pdfDoc.removePage(pageIndex - numToOffsetBy);
    numToOffsetBy++;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
async function loadPdfFromUrl(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });
  return response.data;
}

async function convertPdfToDocuments(pdf: Buffer): Promise<Array<Document>> {
  const randomName = Math.random().toString(36).substring(7);
  await writeFile(`pdfs/${randomName}.pdf`, pdf);
  const loader = new PDFLoader(`pdfs/${randomName}.pdf`);

  const documents = await loader.load();
  await unlink(`pdfs/${randomName}.pdf`);
  return documents;
}

async function chunkDocuments(
  documents: Array<Document>
): Promise<Array<Document>> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitDocuments(documents);
  return chunks;
}

async function initializePinecone(): Promise<void> {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }

    pinecone = new Pinecone({
      apiKey: apiKey,
    });
  }
}

async function storeDocuments(
  documents: Array<Document>,
  name: string
): Promise<void> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  await initializePinecone();

  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME environment variable is required");
  }

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: openaiApiKey,
    model: "text-embedding-3-small",
    maxConcurrency: 10,
    maxRetries: 3,
  });

  // Add metadata to documents
  const documentsWithMetadata = documents.map((doc) => ({
    ...doc,
    metadata: { ...doc.metadata, documentName: name },
  }));

  if (!vectorStore) {
    // Create new vector store
    const index = pinecone!.index(indexName);
    vectorStore = await PineconeStore.fromDocuments(
      documentsWithMetadata,
      embeddings,
      {
        pineconeIndex: index,
      }
    );
  } else {
    // Add to existing vector store
    await vectorStore.addDocuments(documentsWithMetadata);
  }
}

async function processPdfFromUrl({
  paperUrl,
  name,
  pagesToDelete,
}: {
  paperUrl: string;
  name: string;
  pagesToDelete?: number[];
}) {
  if (!paperUrl.endsWith("pdf")) {
    throw new Error("Must be a pdf");
  }
  let pdfAsBuffer = await loadPdfFromUrl(paperUrl);
  if (pagesToDelete && pagesToDelete.length > 0) {
    console.log(`Deleting pages: ${pagesToDelete.join(", ")}`);
    pdfAsBuffer = await deletePages(pdfAsBuffer, pagesToDelete);
  }
  const documents = await convertPdfToDocuments(pdfAsBuffer);
  const chunks = await chunkDocuments(documents);
  await storeDocuments(chunks, name);
  return chunks;
}

const app = express();
app.use(express.json());

// Test endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "RAG API is running" });
});

// Upload PDF endpoint
app.post("/upload", async (req, res) => {
  try {
    const { paperUrl, name, pagesToDelete } = req.body;

    if (!paperUrl) {
      return res.status(400).json({ error: "paperUrl is required" });
    }

    const documents = await processPdfFromUrl({
      paperUrl,
      name,
      pagesToDelete,
    });

    res.json({
      success: true,
      message: "PDF processed successfully",
      documentCount: documents.length,
      name: name || "unnamed",
    });
  } catch (error) {
    console.error("Upload error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

// Chat endpoint that combines RAG with OpenAI
app.post("/chat", async (req, res) => {
  try {
    const { message, k = 4 } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    if (!vectorStore) {
      return res.status(400).json({ error: "No documents uploaded yet" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    // Get relevant documents
    const relevantDocs = await vectorStore.similaritySearch(message, k);

    // Prepare context from retrieved documents
    const context = relevantDocs
      .map((doc, index) => `Document ${index + 1}:\n${doc.pageContent}`)
      .join("\n\n");

    // Initialize OpenAI chat model
    const chatModel = new ChatOpenAI({
      openAIApiKey: apiKey,
      model: "gpt-4o-mini",
      temperature: 0.7,
    });

    // Create prompt with context and user message
    const prompt = `Based on the following context documents, please answer the user's question. If the answer is not found in the context, please say so.

Context:
${context}

Question: ${message}

Answer:`;

    // Get response from OpenAI
    const response = await chatModel.invoke(prompt);

    res.json({
      success: true,
      message,
      response: response.content,
      relevantDocuments: relevantDocs.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`RAG API server running on port ${PORT}`);
});
