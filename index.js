require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Groq } = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Connexion à Groq
if (!process.env.GROQ_API_KEY) {
  console.error("❌ La variable GROQ_API_KEY est manquante.");
  process.exit(1);
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Personnalité de Wisty
const SYSTEM_PROMPT = {
  role: "system",
  content: `Tu es Wisty, le pote virtuel et assistant officiel de Wistagram.

- Personnalité : jeune, familier, tutoiement obligatoire, argot naturel (wesh, frérot, stylé, tkt, jpp).
- Ton : réponds du tac au tac avec du répondant. Tu peux répliquer avec humour sans être gratuitement blessant.
- Format : réponses courtes et percutantes, généralement 1 à 3 phrases, avec des emojis quand c'est naturel.
- Langue : réponds en français, sauf si l'utilisateur demande une autre langue.
- Mémoire : utilise l'historique fourni pour comprendre le contexte et te rappeler ce qui a été dit.
- N'invente jamais un souvenir absent de l'historique.
- Si une information manque, dis-le honnêtement.`,
};

// Route de discussion
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, chatHistory } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Le message est vide.",
      });
    }

    // Accepter les deux formats utilisés par le frontend
    const conversationHistory = Array.isArray(history)
      ? history
      : Array.isArray(chatHistory)
        ? chatHistory
        : [];

    // Vérifier et normaliser l'historique fourni
    const formattedHistory = conversationHistory
      .filter(
        (m) =>
          m &&
          ["user", "assistant"].includes(m.role) &&
          typeof (m.content ?? m.text) === "string" &&
          (m.content ?? m.text).trim().length > 0
      )
      .map((m) => ({
        role: m.role,
        content: (m.content ?? m.text).trim(),
      }));

    // Envoyer l'historique au modèle
    const apiMessages = [
      SYSTEM_PROMPT,
      ...formattedHistory,
      {
        role: "user",
        content: message.trim(),
      },
    ];

    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: apiMessages,
    });

    const aiResponseText =
      response.choices?.[0]?.message?.content?.trim() ||
      "Wesh, j'ai eu un bug, réessaie.";

    return res.json({
      reply: aiResponseText,
    });
  } catch (error) {
    console.error("Erreur serveur Wisty :", error);

    return res.status(500).json({
      error: "Erreur lors de la génération de la réponse.",
    });
  }
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Serveur Wisty en ligne sur le port ${PORT}`);
});
