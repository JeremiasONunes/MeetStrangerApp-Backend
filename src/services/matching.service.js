const { v4: uuidv4 } = require('uuid');

// Filas por categoria (em memória para P2P dinâmico)
const waitingQueues = {
  jogos: [],
  series: [],
  filmes: []
};
const activeRooms = new Map();

class MatchingService {
  joinQueue(userId, socketId, category) {
    // Remove user from all queues if already exists
    this.leaveAllQueues(userId);

    // Check if there's someone waiting in this category
    const queue = waitingQueues[category];
    if (!queue) {
      throw new Error('Invalid category');
    }

    if (queue.length > 0) {
      // Match found!
      const partner = queue.shift();
      const roomId = uuidv4();
      
      // Create room
      const room = {
        id: roomId,
        category,
        user1Id: partner.userId,
        user2Id: userId,
        user1SocketId: partner.socketId,
        user2SocketId: socketId,
        status: 'active',
        createdAt: new Date()
      };
      
      activeRooms.set(roomId, room);
      
      return {
        matched: true,
        roomId,
        category,
        partnerId: partner.userId,
        partnerSocketId: partner.socketId
      };
    } else {
      // Add to queue
      queue.push({
        userId,
        socketId,
        timestamp: Date.now()
      });
      
      return {
        matched: false,
        category,
        queuePosition: queue.length,
        estimatedWait: this.calculateEstimatedWait(queue.length)
      };
    }
  }

  leaveQueue(userId, category = null) {
    if (category) {
      const queue = waitingQueues[category];
      if (queue) {
        const index = queue.findIndex(item => item.userId === userId);
        if (index > -1) {
          queue.splice(index, 1);
          return true;
        }
      }
    } else {
      this.leaveAllQueues(userId);
    }
    return false;
  }

  leaveAllQueues(userId) {
    Object.keys(waitingQueues).forEach(category => {
      this.leaveQueue(userId, category);
    });
  }

  getRoom(roomId) {
    return activeRooms.get(roomId);
  }

  getUserRoom(userId) {
    return Array.from(activeRooms.values()).find(
      room => room.user1Id === userId || room.user2Id === userId
    );
  }

  leaveRoom(roomId, userId) {
    const room = activeRooms.get(roomId);
    if (room) {
      // Remove room completely (P2P dinâmico)
      activeRooms.delete(roomId);
      
      // Get partner info before deleting
      const partnerId = room.user1Id === userId ? room.user2Id : room.user1Id;
      const partnerSocketId = room.user1Id === userId ? room.user2SocketId : room.user1SocketId;
      
      return {
        ...room,
        partnerId,
        partnerSocketId,
        status: 'ended',
        endedAt: new Date()
      };
    }
    return null;
  }

  calculateEstimatedWait(queuePosition) {
    const avgWaitTime = 15; // seconds
    const estimatedSeconds = queuePosition * avgWaitTime;
    
    if (estimatedSeconds < 60) {
      return `${estimatedSeconds}s`;
    } else {
      return `${Math.ceil(estimatedSeconds / 60)}m`;
    }
  }

  getQueueStats() {
    return {
      jogos: waitingQueues.jogos.length,
      series: waitingQueues.series.length,
      filmes: waitingQueues.filmes.length,
      activeRooms: activeRooms.size
    };
  }

  // Limpar salas inativas (cleanup)
  cleanupInactiveRooms() {
    const now = Date.now();
    const maxInactiveTime = 5 * 60 * 1000; // 5 minutos
    
    for (const [roomId, room] of activeRooms.entries()) {
      if (now - room.createdAt.getTime() > maxInactiveTime) {
        activeRooms.delete(roomId);
      }
    }
  }
}

module.exports = new MatchingService();