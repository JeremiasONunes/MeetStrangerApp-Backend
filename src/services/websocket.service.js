const jwt = require('jsonwebtoken');
const matchingService = require('./matching.service');
const authService = require('./auth.service');
const { v4: uuidv4 } = require('uuid');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(io) {
    this.io = io;

    io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Authentication
      socket.on('authenticate', async (data) => {
        console.log(`🔑 Authentication attempt for socket: ${socket.id}`);
        try {
          const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
          socket.userId = decoded.userId;
          this.connectedUsers.set(decoded.userId, socket.id);
          
          // Set user online
          await authService.setUserOnline(decoded.userId, true);
          
          socket.emit('authenticated', { userId: decoded.userId });
          console.log(`✅ User authenticated: ${decoded.userId}`);
        } catch (error) {
          console.log(`❌ Auth failed for socket ${socket.id}:`, error.message);
          socket.emit('auth_error', { message: 'Invalid token' });
        }
      });

      // Join matching queue
      socket.on('find-match', async (data) => {
        console.log(`🔍 User ${socket.userId} looking for match in category: ${data.category}`);
        
        if (!socket.userId) {
          console.log('❌ User not authenticated');
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { category } = data;
        if (!category || !['jogos', 'series', 'filmes', 'games', 'movies', 'shows'].includes(category)) {
          console.log(`❌ Invalid category: ${category}`);
          socket.emit('error', { message: 'Invalid category. Use: jogos, series, filmes' });
          return;
        }

        // Map English to Portuguese
        const categoryMap = {
          'games': 'jogos',
          'movies': 'filmes', 
          'shows': 'series'
        };
        const mappedCategory = categoryMap[category] || category;

        const result = matchingService.joinQueue(socket.userId, socket.id, mappedCategory);
        console.log(`📊 Queue result:`, result);

        if (result.matched) {
          console.log(`✅ Match found! Room: ${result.roomId}`);
          // Get usernames for both users
          const user1 = await authService.getUserById(socket.userId);
          const user2 = await authService.getUserById(result.partnerId);
          
          // Notify both users about the match
          const partnerSocket = io.sockets.sockets.get(result.partnerSocketId);
          
          socket.emit('match-found', {
            roomId: result.roomId,
            category: result.category,
            partner: { username: user2 ? user2.username : 'Usuário' }
          });
          
          if (partnerSocket) {
            partnerSocket.emit('match-found', {
              roomId: result.roomId,
              category: result.category,
              partner: { username: user1 ? user1.username : 'Usuário' }
            });
          }
        } else {
          console.log(`⏳ Added to queue. Position: ${result.queuePosition}`);
          socket.emit('queue-status', {
            category: mappedCategory,
            position: result.queuePosition,
            estimatedWait: result.estimatedWait
          });
        }
      });

      // Leave queue
      socket.on('cancel-matching', (data) => {
        if (socket.userId) {
          matchingService.leaveAllQueues(socket.userId);
          socket.emit('matching-cancelled', { success: true });
        }
      });

      // Join chat room
      socket.on('join-room', (data) => {
        const room = matchingService.getRoom(data.roomId);
        if (room && (room.user1Id === socket.userId || room.user2Id === socket.userId)) {
          socket.join(data.roomId);
          socket.currentRoom = data.roomId;
          
          socket.emit('room-joined', { roomId: data.roomId });
        }
      });

      // Send message (P2P - não salva no banco)
      socket.on('send-message', async (data) => {
        if (!socket.currentRoom || !socket.userId) return;

        // Get sender's username
        const sender = await authService.getUserById(socket.userId);
        const senderUsername = sender ? sender.username : 'Usuário';

        const message = {
          id: uuidv4(),
          message: data.message,
          senderId: socket.userId,
          timestamp: new Date()
        };

        // Broadcast apenas para o parceiro (P2P)
        socket.to(socket.currentRoom).emit('new-message', {
          id: message.id,
          message: message.message,
          username: senderUsername,
          timestamp: message.timestamp
        });
      });

      // Typing indicators
      socket.on('typing_start', (data) => {
        if (socket.currentRoom) {
          socket.to(socket.currentRoom).emit('partner_typing', { isTyping: true });
        }
      });

      socket.on('typing_stop', (data) => {
        if (socket.currentRoom) {
          socket.to(socket.currentRoom).emit('partner_typing', { isTyping: false });
        }
      });

      // Leave room
      socket.on('leave-room', (data) => {
        console.log(`👋 User ${socket.userId} leaving room ${data.roomId}`);
        this.handleLeaveRoom(socket, data.roomId);
      });

      // Disconnect
      socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (socket.userId) {
          // Set user offline
          await authService.setUserOnline(socket.userId, false);
          
          // Leave queue
          matchingService.leaveQueue(socket.userId);
          this.connectedUsers.delete(socket.userId);
          
          // Handle room disconnection - notify partner immediately
          this.handleLeaveRoom(socket, socket.currentRoom, true);
        }
      });
    });

    // Cleanup inactive rooms every 5 minutes
    setInterval(() => {
      matchingService.cleanupInactiveRooms();
    }, 5 * 60 * 1000);
  }

  handleLeaveRoom(socket, roomId = null, isDisconnect = false) {
    const targetRoom = roomId || socket.currentRoom;
    if (targetRoom) {
      console.log(`🚪 Handling leave room: ${targetRoom}, disconnect: ${isDisconnect}`);
      const roomData = matchingService.leaveRoom(targetRoom, socket.userId);
      
      if (roomData) {
        console.log(`📢 Notifying partner about user leaving room ${targetRoom}`);
        // Notify partner that user left
        socket.to(targetRoom).emit('partner_left', { 
          roomId: targetRoom,
          message: isDisconnect ? 'Seu parceiro se desconectou' : 'Seu parceiro saiu da conversa'
        });
        
        // Auto-reconnect partner to queue
        if (roomData.partnerSocketId) {
          const partnerSocket = this.io.sockets.sockets.get(roomData.partnerSocketId);
          if (partnerSocket) {
            console.log(`🔄 Auto-reconnecting partner ${roomData.partnerId}`);
            partnerSocket.currentRoom = null;
            partnerSocket.emit('partner_disconnected', {
              message: 'Procurando nova pessoa...'
            });
            
            // Auto join queue for partner
            setTimeout(() => {
              if (partnerSocket.userId) {
                console.log(`🔍 Starting new search for partner in category: ${roomData.category}`);
                const result = matchingService.joinQueue(partnerSocket.userId, partnerSocket.id, roomData.category);
                if (result.matched) {
                  const newPartnerSocket = this.io.sockets.sockets.get(result.partnerSocketId);
                  
                  partnerSocket.emit('match-found', {
                    roomId: result.roomId,
                    category: result.category,
                    partner: { username: 'Usuário' }
                  });
                  
                  if (newPartnerSocket) {
                    newPartnerSocket.emit('match-found', {
                      roomId: result.roomId,
                      category: result.category,
                      partner: { username: 'Usuário' }
                    });
                  }
                } else {
                  partnerSocket.emit('queue-status', {
                    category: result.category,
                    position: result.queuePosition,
                    estimatedWait: result.estimatedWait
                  });
                }
              }
            }, 1000);
          }
        }
      }
      
      socket.leave(targetRoom);
      socket.currentRoom = null;
    }
  }

  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }
}

module.exports = new WebSocketService();