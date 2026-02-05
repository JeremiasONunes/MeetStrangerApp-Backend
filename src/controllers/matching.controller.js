const matchingService = require('../services/matching.service');

class MatchingController {
  async joinQueue(req, res) {
    try {
      const { category } = req.body;
      const userId = req.user.userId;
      
      if (!category || !['jogos', 'series', 'filmes'].includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category. Use: jogos, series, filmes'
        });
      }
      
      res.json({
        success: true,
        message: 'Join queue via WebSocket for real-time matching',
        instructions: `Use WebSocket event: join_queue with category: ${category}`
      });
    } catch (error) {
      res.status(500).json({
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
        message: 'Left all queues successfully'
      });
    } catch (error) {
      res.status(500).json({
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