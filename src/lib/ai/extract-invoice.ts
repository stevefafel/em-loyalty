import OpenAI, { toFile } from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadPdfToOpenAI(buffer: Buffer): Promise<string> {
  const file = await openai.files.create({
    file: await toFile(buffer, "invoice.pdf", { type: "application/pdf" }),
    purpose: "assistants",
  });
  return file.id;
}

export interface InvoiceExtractionResult {
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string | null;
  line_items: {
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
  }[];
}

const SYSTEM_PROMPT = `You are an invoice data extraction assistant. Analyze the provided invoice document and extract structured data. Return a JSON object with these exact fields:
{
  "vendor_name": string or null,
  "invoice_number": string or null,
  "invoice_date": "YYYY-MM-DD" or null,
  "subtotal": number or null (before tax),
  "tax_amount": number or null,
  "total_amount": number or null (final total),
  "currency": "USD" or appropriate ISO currency code,
  "line_items": [
    {
      "description": string,
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number (line total)
    }
  ]
}
All monetary values should be numbers (not strings). If a field cannot be determined, use null. Extract all visible line items.`;

export async function extractInvoiceData(
  fileBuffer: Buffer,
  mimeType: string
): Promise<InvoiceExtractionResult> {
  const base64 = fileBuffer.toString("base64");

  const contentParts: ChatCompletionContentPart[] = [];

  if (mimeType === "application/pdf") {
    const fileId = await uploadPdfToOpenAI(fileBuffer);
    contentParts.push({
      type: "file",
      file: { file_id: fileId },
    } as ChatCompletionContentPart);
  } else {
    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: "high",
      },
    });
  }

  contentParts.push({
    type: "text",
    text: "Extract the structured data from this invoice.",
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ],
    max_tokens: 2000,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  return JSON.parse(content) as InvoiceExtractionResult;
}
