export type AgentConfigRow = {
  agent_name: string
  business_context: string | null
  escalation_instructions: string | null
}

export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqApiResponse = {
  choices: Array<{
    message: { role: string; content: string }
    finish_reason: string
  }>
}

export type GroqResult = { content: string | null; rateLimited: boolean }

export function buildSystemPrompt(agent: AgentConfigRow | null): string {
  const styleRules = [
    'PRIORIDADE MÁXIMA: sempre responda diretamente a pergunta que o cliente acabou de fazer. Se ele perguntar o preço, responda o preço. Nunca substitua a resposta direta por uma reapresentação geral do produto ou da lista de livros — isso é uma falha grave.',
    'Exemplo do que NÃO fazer: cliente pergunta "Quanto custa?" e você responde reapresentando os 3 livros sem dizer o preço — isso está ERRADO. Exemplo do que fazer: cliente pergunta "Quanto custa?" e você responde "O Kit completo sai por R$ 55,00." — isso está CERTO.',
    'Responda sempre em português brasileiro, de forma natural e conversacional, como alguém digitando no celular.',
    'Limite cada resposta a no máximo 2 a 4 frases curtas. Isso é WhatsApp, não e-mail.',
    'Nunca use markdown: sem **negrito**, sem #, sem listas com - ou *. Se precisar listar algo, use frase corrida ou números seguidos de ponto.',
    'Releia o histórico da conversa antes de responder. Nunca repita uma resposta já dada literalmente. Se o cliente repetir a mesma pergunta, responda de novo com gentileza e paciência, sem soar irritado, seco ou como se estivesse repreendendo — nunca diga frases como "já falei" ou "como eu disse". Trate como se fosse a primeira vez, só reforçando a informação com calma.',
    'Faça apenas uma pergunta por mensagem.',
    'Use saudação ("Oi") apenas na primeira mensagem da conversa. Nas demais, vá direto ao ponto.',
    'Nunca invente preço, frete, prazo, estoque ou forma de pagamento que não esteja explícito no contexto do negócio. Se não souber, diga com transparência que vai confirmar.',
    'Quando decidir transferir para um humano, inclua exatamente [TRANSFERIR] no início da mensagem — essa tag será removida antes de chegar ao cliente.',
  ]

  if (!agent) {
    return [
      'Você é um assistente de atendimento ao cliente prestativo e cordial.',
      ...styleRules,
    ].join('\n')
  }

  const parts = [
    `Você é ${agent.agent_name}, um assistente de atendimento ao cliente.`,
    ...styleRules,
  ]

  if (agent.business_context?.trim()) {
    parts.push(`\nCONTEXTO DO NEGÓCIO:\n${agent.business_context.trim()}`)
  }

  if (agent.escalation_instructions?.trim()) {
    parts.push(`\nINSTRUÇÕES DE ESCALADA:\n${agent.escalation_instructions.trim()}`)
  }

  return parts.join('\n')
}

export async function callGroq(messages: GroqChatMessage[]): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[agent] GROQ_API_KEY não configurada')
    return { content: null, rateLimited: false }
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[agent] Groq error', res.status, err)
    return { content: null, rateLimited: res.status === 429 }
  }

  const json = (await res.json()) as GroqApiResponse
  return { content: json.choices[0]?.message?.content?.trim() ?? null, rateLimited: false }
}
