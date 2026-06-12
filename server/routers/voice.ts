import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { transcribeAudio } from "../_core/voiceTranscription";
import { createCommunication, createTask, logActivity } from "../db";
import { invokeLLM } from "../_core/llm";

export const voiceRouter = router({
  transcribe: protectedProcedure
    .input(z.object({
      audioUrl: z.string().url(),
      contactId: z.number().optional().nullable(),
      transactionId: z.number().optional().nullable(),
      agentConnectionId: z.number().optional().nullable(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Transcribe audio
      const result = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language ?? "en",
        prompt: "Real estate agent voice note. May include property details, client notes, or follow-up items.",
      });

      const transcription = 'text' in result ? result.text : '';

      // Use LLM to extract action items from transcription
      let actionItems: string[] = [];
      try {
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a real estate assistant. Extract action items and follow-up tasks from voice notes. Return a JSON array of task strings.",
            },
            {
              role: "user",
              content: `Extract action items from this voice note:\n\n${transcription}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "action_items",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  tasks: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["tasks"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = llmResult.choices[0]?.message?.content;
        const contentStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        const parsed = JSON.parse(contentStr ?? "{}");
        actionItems = parsed.tasks ?? [];
      } catch (_) {}

      // Save as communication (voice note)
      const commId = await createCommunication({
        type: "voice_note",
        subject: "Voice Note",
        body: transcription,
        direction: "internal",
        authorId: ctx.user.id,
        relatedContactId: input.contactId ?? null,
        relatedTransactionId: input.transactionId ?? null,
        relatedAgentConnectionId: input.agentConnectionId ?? null,
        audioFileUrl: input.audioUrl,
        transcription,
      });

      // Create tasks from action items
      const taskIds: number[] = [];
      for (const item of actionItems.slice(0, 5)) {
        const taskId = await createTask({
          title: item,
          assignedToId: ctx.user.id,
          createdById: ctx.user.id,
          relatedContactId: input.contactId ?? null,
          relatedTransactionId: input.transactionId ?? null,
          taskType: "follow_up",
          priority: "medium",
          isAutomated: true,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        taskIds.push(taskId);
      }

      await logActivity({
        userId: ctx.user.id,
        action: "voice_note_transcribed",
        entityType: "communication",
        entityId: commId,
        details: { taskCount: taskIds.length },
      });

      return {
        transcription,
        actionItems,
        communicationId: commId,
        taskIds,
      };
    }),
});
