module.exports = {
  botStartTime: Date.now(),

  // Keep-alive state
  lastPingTime: Date.now(),
  keepAliveWarned: false,
  lastPingLogMessage: null,

  // Anti-spam state
  spamCache: new Map(),
  spamStrikes: new Map(),

  // Reaction role state (memory only)
  reactionRolePanels: new Map(),

  // Settings panel ownership (memory only)
  settingsPanels: new Map(),

  // Mini game sessions (memory only)
  rpsGames: new Map(),
  quizSessions: new Map(),

  // Watchdog / heartbeat markers
  lastInteractionAt: Date.now(),
  lastGatewayActivityAt: Date.now(),

  // 3) Cold mode (stability protection)
  coldModeUntil: 0,

  // 2) Silent failover anti-spam cache
  errorCache: new Map(),
};
