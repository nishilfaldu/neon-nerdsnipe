import 'dotenv/config' 
import { chat, streamToText, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createCodeMode } from "@tanstack/ai-code-mode";
import { createQuickJSIsolateDriver } from "@tanstack/ai-isolate-quickjs";
import z from 'zod';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_V2 } from './prompt.js';
import { WebsocketPayload } from './types.js';
import { reconstructMessage } from './helpers.js';

const reconstructTool = toolDefinition({
    name: "reconstructMessage",
    description: "Reconstruct received message",
    inputSchema: z.object({
        fragments: z.array(z.object({
            word: z.string(),
            timestamp: z.number()
        }))
    }),
    outputSchema: z.object({ text: z.string() }),
}).server(async ({ fragments }) => {
    const text = fragments
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(f => f.word)
    .join(' ');
  return { text };
  });

const knowledgeArchiveTool = toolDefinition({
    name: "knowledgeArchive",
    description: "Fetch the summary of a wikipedia page and return the Nth word",
    inputSchema: z.object({ title: z.string(), nthWord: z.optional(z.number()) }),
    outputSchema: z.object({
        type: z.literal('speak_text'),
        text: z.string(),
    }),
  }).server(async ({ title, nthWord }) => {
    return fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
      .then((res) => res.json())
      .then((data) => ({
        type: 'speak_text' as const,
        text: nthWord ? data.extract.split(' ')[nthWord - 1] : data.extract,
      }));
  });

const { tool: codemodeTool, systemPrompt } = createCodeMode({
  driver: createQuickJSIsolateDriver(),
  tools: [knowledgeArchiveTool],
  timeout: 30_000,
});

// console.log("systemPrompt: ", systemPrompt)



const socket = new WebSocket("wss://neonhealth.software/agent-puzzle/challenge");

const messagesHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

socket.onopen = () => {
    console.log("connected");
    // socket.send("hello");
}

socket.onmessage = async (event) => {
    const receivedData = JSON.parse(event.data) as WebsocketPayload
    console.log('event data ', receivedData)

    if(receivedData.type !== 'challenge' || !receivedData.message) return;

    const reconstructedMessage = reconstructMessage(receivedData.message);
    console.log('reconstructed message: ', reconstructedMessage)

    messagesHistory.push({ role: "user", content: reconstructedMessage })

    const stream = chat({
        adapter: openaiText('gpt-5.4-mini'),
        systemPrompts: [
            SYSTEM_PROMPT_V2,
            systemPrompt
        ],
        messages: messagesHistory,
        tools: [codemodeTool, reconstructTool]
    })

    // for await (const chunk of stream) {
    //     console.log("tool call name: ", chunk.toolCallName)
    // }


    const reply = await streamToText(stream)

    console.log(`reply: ${reply}\n`);

    messagesHistory.push({ role: "assistant", content: reply })

    socket.send(reply);
}

socket.onerror = (error) => {
    console.log("error: ", error)
}

socket.onclose = () => {
    console.log("disconnected")
}