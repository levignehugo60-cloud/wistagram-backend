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
- Format : Réponses ultra courtes et percutantes (1 à 3 phrases max). Utilise des émojis.`
};

// Route principale pour chatter avec Wisty
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Le message est vide." });
    }

    // Formater l'historique envoyé par le client (garde les 10 derniers messages)
    const formattedHistory = (history || []).slice(-10).map(m => ({
      role: m.role,
      content: m.text || m.content
    }));

    const apiMessages = [SYSTEM_PROMPT, ...formattedHistory, { role: "user", content: message }];

    const response = await groq.chat.completions.create({
      messages: apiMessages,
      model: "openai/gpt-oss-120b"
    });

    const aiResponseText = response.choices[0]?.message?.content || "Wesh j'ai eu un bug, réessaie.";

    return res.json({ reply: aiResponseText });
  } catch (error) {
    console.error("Erreur serveur :", error);
    return res.status(500).json({ error: "Erreur lors de la génération de la réponse." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur Wisty en ligne sur le port ${PORT}`);
});
