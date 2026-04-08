// Importa o framework Express para criação de rotas
const express = require('express');

// Importa o controller responsável pelas ações do chat
const chatController = require('../controllers/chat.controller');

// Importa o middleware de autenticação
const authMiddleware = require('../middleware/auth.middleware');

// Importa o middleware de validação e os schemas definidos
const { validate, schemas } = require('../middleware/validation.middleware');

// Importa os limitadores de requisição (rate limit)
const { chatLimiter, messageLimiter } = require('../middleware/rateLimit.middleware');

// Cria uma instância do roteador do Express
const router = express.Router();

// Aplica o middleware de autenticação em TODAS as rotas abaixo
router.use(authMiddleware);

// Aplica um limitador geral de requisições para rotas de chat
router.use(chatLimiter);

// Rota GET para listar todas as salas de chat do usuário
router.get('/rooms',
  chatController.getRooms // Chama o método que retorna as salas
);

// Rota GET para buscar mensagens de uma sala específica
router.get('/rooms/:roomId/messages',
  chatController.getRoomMessages // Retorna mensagens da sala informada
);

// Rota POST para enviar uma mensagem em uma sala específica
router.post('/rooms/:roomId/messages',
  messageLimiter, // Limita a quantidade de mensagens enviadas (anti-spam)
  validate(schemas.message), // Valida o corpo da requisição com base no schema
  chatController.sendMessage // Envia a mensagem para a sala
);

// Rota POST para sair de uma sala específica
router.post('/rooms/:roomId/leave',
  chatController.leaveRoom // Executa a lógica de saída da sala
);

// Exporta o router para ser utilizado na aplicação
module.exports = router;