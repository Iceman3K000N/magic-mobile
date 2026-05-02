import { Router } from 'express';
import OpenAI from 'openai';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

router.use(authenticate);

router.post('/summarize-thread', async (req: AuthRequest, res) => {
  const { threadText } = req.body;
  if (!threadText) return res.status(400).json({ error: 'threadText required' });
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are LinkUpAI, summarizing chat threads into key points and action items.' },
        { role: 'user', content: `Summarize this thread:\n${threadText}` },
      ],
    });
    res.json({ summary: completion.choices[0]?.message?.content ?? '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error' });
  }
});

router.post('/summarize-meeting', async (req: AuthRequest, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'transcript required' });
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are LinkUpAI, summarizing meetings into concise notes.' },
        { role: 'user', content: `Summarize this meeting:\n${transcript}` },
      ],
    });
    res.json({ summary: completion.choices[0]?.message?.content ?? '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error' });
  }
});

router.post('/create-poll', async (req: AuthRequest, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'Generate short multiple-choice polls for team decisions.' },
        { role: 'user', content: `Create a poll about: ${topic}` },
      ],
    });
    res.json({ poll: completion.choices[0]?.message?.content ?? '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error' });
  }
});

export default router;
