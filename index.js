
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Vérification de la configuration
if (!process.env.GROQ_API_KEY) {
  console.error("ERREUR : la variable GROQ_API_KEY est absente.");
}

// Initialisation de Groq
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Modèles utilisés : modèle principal puis solution de secours
const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `
Tu es Wisty, l'assistant officiel de Wistagram.
Tu es sympa, dynamique, utile et naturel.
Réponds en français si l'utilisateur écrit en français.
Réponds directement à la demande de l'utilisateur.
Produis une réponse en texte simple, sans format JSON imposé.
N'invente pas de faits lorsque tu ne connais pas la réponse.
`.trim();

// Route de santé : permet de vérifier si le serveur démarre
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: "Wisty",
  });
});

// Appel à un modèle Groq
async function generateReply(model, message, history) {
  const completion = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...history,
      {
        role: "user",
        content: message,
      },
    ],
    temperature: 0.7,
    max_completion_tokens: 1024,
  });

  const reply = completion.choices?.[0]?.message?.content;

  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error(`Le modèle ${model} a renvoyé une réponse vide.`);
  }

  return reply.trim();
}

// Route de discussion
app.post("/api/chat", async (req, res) => {
  try {
    if (!groq) {
      return res.status(503).json({
        error: "Le service Wisty n'est pas configuré.",
        code: "missing_groq_api_key",
      });
    }

    const body = req.body || {};
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({
        error: "Écris un message avant d'envoyer.",
        code: "empty_message",
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Ton message est trop long (maximum 4000 caractères).",
        code: "message_too_long",
      });
    }

    // Ne conserver que les messages user/assistant valides.
    const rawHistory = Array.isArray(body.chatHistory)
      ? body.chatHistory
      : [];

    const history = rawHistory
      .filter(
        (item) =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string" &&
          item.content.trim().length > 0
      )
      .slice(-20)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 4000),
      }));

    let reply;

    try {
      reply = await generateReply(PRIMARY_MODEL, message, history);
    } catch (primaryError) {
      console.error("Échec du modèle principal :", {
        status: primaryError.status,
        code: primaryError.code,
        message: primaryError.message,
      });

      // Un second modèle est essayé si le premier échoue.
      reply = await generateReply(FALLBACK_MODEL, message, history);
    }

    return res.status(200).json({ reply });
  } catch (error) {
    const status = error.status;
    const code = error.code;

    console.error("Erreur Wisty :", {
      status,
      code,
      message: error.message,
    });

    if (status === 401 || status === 403) {
      return res.status(502).json({
        error: "Le service IA a refusé la requête. Vérifie la configuration de Groq.",
        code: "ai_service_auth_error",
      });
    }

    if (status === 429) {
      return res.status(503).json({
        error: "Wisty est très sollicité. Réessaie dans un instant.",
        code: "ai_rate_limit",
      });
    }

    return res.status(502).json({
      error: "Wisty n'a pas réussi à générer une réponse.",
      code: code || "ai_generation_error",
    });
  }
});

// Route inconnue
app.use((req, res) => {
  res.status(404).json({
    error: "Route introuvable.",
    code: "not_found",
  });
});

// Gestion des erreurs JSON mal formé
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      error: "Le JSON envoyé est invalide.",
      code: "invalid_json",
    });
  }

  console.error("Erreur serveur inattendue :", error.message);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "Une erreur interne est survenue.",
    code: "internal_error",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur Wisty démarré sur le port ${PORT}`);
});
