const matchingService = require('../services/matching.service');

class MatchingController {
  async joinQueue(req, res) {
    try {
      const { category } = req.body;
      const userId = req.user.userId;
      
      // This would be handled by WebSocket in real implementation
      res.json({
        success: true,
        message: 'Use WebSocket for real-time matching'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async leaveQueue(req, res) {
    try {
      const userId = req.user.userId;
      matchingService.leaveAllQueues(userId);
      
      res.json({
        success: true,
        message: 'Left all queues'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getQueueStats(req, res) {
    try {
      const stats = matchingService.getQueueStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new MatchingController();