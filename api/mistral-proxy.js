export default async function handler(req, res) {
    // Stellen Sie sicher, dass nur POST-Anfragen akzeptiert werden
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Laden Sie den API-Key aus den Umgebungsvariablen
        const apiKey = process.env.MISTRAL_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API-Key is not set' });
        }

        // Extrahieren Sie die Nachricht aus der Anfrage
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid request body' });
        }

        // Senden Sie die Anfrage an die Mistral-API
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "mistral-large-latest",
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7,
            }),
        });

        const data = await response.json();

        // Rückgabe der Antwort an das Frontend
        if (response.ok) {
            res.status(200).json(data);
        } else {
            res.status(response.status).json({ error: data.error || 'Unknown Error' });
        }
    } catch (error) {
        console.error('Fehler beim Aufruf der Mistral-API:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}