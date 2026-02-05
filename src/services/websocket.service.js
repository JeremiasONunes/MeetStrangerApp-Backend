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
        try {
          const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
          socket.userId = decoded.userId;
          this.connectedUsers.set(decoded.userId, socket.id);
          
          // Set user online
          await authService.setUserOnline(decoded.userId, true);
          
          socket.emit('authenticated', { userId: decoded.userId });
          console.log(`User authenticated: ${decoded.userId}`);
        } catch (error) {
          socket.emit('auth_error', { message: 'Invalid token' });
        }
      });

      // Join matching queue
      socket.on('join_queue', (data) => {
        if (!socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { category } = data;
        if (!category || !['jogos', 'series', 'filmes'].includes(category)) {
          socket.emit('error', { message: 'Invalid category. Use: jogos, series, filmes' });
          return;
        }

        const result = matchingService.joinQueue(socket.userId, socket.id, category);

        if (result.matched) {
          // Notify both users about the match
          const partnerSocket = io.sockets.sockets.get(result.partnerSocketId);
          
          socket.emit('match_found', {
            roomId: result.roomId,
            category: result.category,
            partner: { username: 'Stranger' }
          });
          
          if (partnerSocket) {
            partnerSocket.emit('match_found', {
              roomId: result.roomId,
              category: result.category,
              partner: { username: 'Stranger' }
            });
          }
        } else {
          socket.emit('queue_status', {
            category: result.category,
            position: result.queuePosition,
            estimatedWait: result.estimatedWait
          });
        }
      });

      // Leave queue
      socket.on('leave_queue', (data) => {
        if (socket.userId) {
          matchingService.leaveAllQueues(socket.userId);
          socket.emit('left_queue', { success: true });
        }
      });

      // Join chat room
      socket.on('join_room', (data) => {
        const room = matchingService.getRoom(data.roomId);
        if (room && (room.user1Id === socket.userId || room.user2Id === socket.userId)) {
          socket.join(data.roomId);
          socket.currentRoom = data.roomId;
          
          socket.emit('room_joined', { roomId: data.roomId });
        }
      });

      // Send message (P2P - não salva no banco)
      socket.on('send_message', (data) => {
        if (!socket.currentRoom || !socket.userId) return;

        const message = {
          id: uuidv4(),
          content: data.content,
          senderId: socket.userId,
          timestamp: new Date()
        };

        // Broadcast apenas para o parceiro (P2P)
        socket.to(socket.currentRoom).emit('new_message', {
          id: message.id,
          content: message.content,
          sender: { 
            id: message.senderId,
            username: 'Stranger'
          },
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
      socket.on('leave_room', (data) => {
        this.handleLeaveRoom(socket);
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
          
          // Handle room disconnection
          this.handleLeaveRoom(socket);
        }
      });
    });

    // Cleanup inactive rooms every 5 minutes
    setInterval(() => {
      matchingService.cleanupInactiveRooms();
    }, 5 * 60 * 1000);
  }

  handleLeaveRoom(socket) {
    if (socket.currentRoom) {
      const roomData = matchingService.leaveRoom(socket.currentRoom, socket.userId);
      
      if (roomData) {
        // Notify partner that user left
        socket.to(socket.currentRoom).emit('partner_left', { 
          roomId: socket.currentRoom 
        });
        
        // Auto-reconnect partner to queue
        if (roomData.partnerSocketId) {
          const partnerSocket = this.io.sockets.sockets.get(roomData.partnerSocketId);
          if (partnerSocket) {
            partnerSocket.currentRoom = null;
            partnerSocket.emit('partner_disconnected', {
              message: 'Your partner left. Finding new connection...'
            });
            
            // Auto join queue for partner
            setTimeout(() => {
              if (partnerSocket.userId) {
                // Try to reconnect with same category
                const result = matchingService.joinQueue(partnerSocket.userId, partnerSocket.id, roomData.category);
                if (result.matched) {
                  const newPartnerSocket = this.io.sockets.sockets.get(result.partnerSocketId);
                  
                  partnerSocket.emit('match_found', {
                    roomId: result.roomId,
                    category: result.category,
                    partner: { username: 'Stranger' }
                  });
                  
                  if (newPartnerSocket) {
                    newPartnerSocket.emit('match_found', {
                      roomId: result.roomId,
                      category: result.category,
                      partner: { username: 'Stranger' }
                    });
                  }
                } else {
                  partnerSocket.emit('queue_status', {
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
      
      socket.leave(socket.currentRoom);
      socket.currentRoom = null;
    }
  }

  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }
}

module.exports = new WebSocketService();