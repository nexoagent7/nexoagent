export async function sendEvolutionText(
  instanceName: string,
  phone: string,
  text: string
): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey  = process.env.EVOLUTION_API_KEY

  if (!baseUrl || !apiKey) {
    console.error('[evolution] Evolution API não configurada')
    return
  }

  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ number: phone, text }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[evolution] sendText error', res.status, err)
  } else {
    console.log('[evolution] mensagem enviada para', phone)
  }
}
