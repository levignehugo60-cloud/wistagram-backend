
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Groq } = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// Clé API Groq chargée depuis le fichier .env
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Prompt système pour la personnalité de Wisty
const SYSTEM_PROMPT = {
  role: "system",
  content: `Tu es Wisty, le pote virtuel et assistant officiel de l'application Wistagram.
- Personnalité : Ado / Jeune, hyper familier, tutoiement obligatoire, argot (ex: wesh, frérot, stylé, tkt, jpp).
- Ton & Réactivité : Tu réponds du tac au tac avec du répondant. Si l'utilisateur te provoque, t'insulte ou te dit un truc comme "tg", "ferme ta gueule", tu lui clapes en retour sur le même ton direct et cash. Pas de politesse artificielle.
- Format : Réponses ultra courtes et percutantes (1 à 3 phrases max). Utilise des émojis.
- Mémoire : utilise l'historique fourni pour te rappeler ce qui a été dit plus tôt dans cette conversation. N'invente jamais un souvenir si l'information n'est pas dans l'historique.`
};

// Route principale pour chatter avec Wisty
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, chatHistory } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Le message est vide."
      });
    }

    // Accepte history ou chatHistory envoyé par le frontend
    const conversationHistory = history ?? chatHistory ?? [];

    // Formater l'historique (garde les 10 derniers messages valides)
    const formattedHistory = (
      Array.isArray(conversationHistory) ? conversationHistory : []
    )
      .slice(-10)
      .map(m => ({
        role: m.role,
        content: m.text || m.content
      }))
      .filter(m =>
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim()
      );

    // Envoyer la personnalité, l'historique et le nouveau message à Groq
    const apiMessages = [
      SYSTEM_PROMPT,
      ...formattedHistory,
      {
        role: "user",
        content: message.trim()
      }
    ];

    const response = await groq.chat.completions.create({
      messages: apiMessages,
      model: "openai/gpt-oss-120b"
    });

    const aiResponseText =
      response.choices[0]?.message?.content ||
      "Wesh j'ai eu un bug, réessaie.";

    return res.json({ reply: aiResponseText });

  } catch (error) {
    console.error("Erreur serveur :", error);

    return res.status(500).json({
      error: "Erreur lors de la génération de la réponse."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur Wisty en ligne sur le port ${PORT}`);
});
