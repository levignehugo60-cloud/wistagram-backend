
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration du serveur
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Vérification de la clé Groq
if (!process.env.GROQ_API_KEY) {
  console.error(
    "ERREUR : la variable GROQ_API_KEY est absente de l'environnement."
  );
}

// Initialisation du client Groq
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Modèles Groq
const PRIMARY_MODEL = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "openai/gpt-oss-20b";

// Instructions de Wisty
const SYSTEM_PROMPT = `
Tu es Wisty, l'assistant officiel de Wistagram.

Tu es sympa, dynamique, naturel et utile.
Tu réponds en français lorsque l'utilisateur écrit en français.
Tu adaptes tes réponses à la question de l'utilisateur.
Tu privilégies des réponses claires et faciles à comprendre.
Tu réponds en texte simple, sans imposer de format JSON.
Si tu ne connais pas une information, tu le dis honnêtement.
`.trim();

// Vérifier que le serveur fonctionne
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: "Wisty",
  });
});

// Créer une réponse avec un modèle Groq
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

// Route de discussion de Wisty
app.post("/api/chat", async (req, res) => {
  try {
    // Vérifier la configuration Groq
    if (!groq) {
      return res.status(503).json({
        error: "Wisty n'est pas configuré correctement.",
        code: "missing_groq_api_key",
      });
    }

    // Vérifier le message reçu
    const body = req.body || {};

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        error: "Le message est vide ou invalide.",
        code: "empty_message",
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Le message ne peut pas dépasser 4000 caractères.",
        code: "message_too_long",
      });
    }

    // Préparer l'historique de conversation
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

    // Essayer d'abord le modèle principal
    let reply;

    try {
      reply = await generateReply(
        PRIMARY_MODEL,
        message,
        history
      );
    } catch (primaryError) {
      console.error("Échec du modèle principal :", {
        status: primaryError.status,
        code: primaryError.code,
        message: primaryError.message,
      });

      // Ne pas masquer les erreurs de configuration/authentification
      // en réessayant inutilement un second modèle.
      if (
        primaryError.status === 401 ||
        primaryError.status === 403
      ) {
        throw primaryError;
      }

      // Essayer le modèle de secours
      reply = await generateReply(
        FALLBACK_MODEL,
        message,
        history
      );
    }

    // Renvoyer la réponse au frontend
    return res.status(200).json({
      reply,
    });
  } catch (error) {
    console.error("Erreur Wisty :", {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    if (error.status === 401 || error.status === 403) {
      return res.status(502).json({
        error:
          "Le service IA a refusé la requête. Vérifie la clé Groq et les accès du compte.",
        code: "ai_service_auth_error",
      });
    }

    if (error.status === 429) {
      return res.status(503).json({
        error: "Wisty est très sollicité. Réessaie dans un instant.",
        code: "ai_rate_limit",
      });
    }

    if (error.status === 404) {
      return res.status(502).json({
        error:
          "Le modèle Groq demandé est introuvable ou inaccessible. Vérifie les identifiants des modèles.",
        code: "model_not_found",
      });
    }

    return res.status(502).json({
      error: "Wisty n'a pas réussi à générer une réponse.",
      code: error.code || "ai_generation_error",
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

// Gestion des erreurs JSON et erreurs inattendues
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

// Démarrer le serveur
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur Wisty démarré sur le port ${PORT}`);
});
