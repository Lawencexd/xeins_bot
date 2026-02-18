const { getGuild } = require("../store/settings");

module.exports = {
  name: "guildMemberAdd",
  async execute(client, member) {
    try {
      const s = getGuild(member.guild.id);
      const roleId = s.roles?.autorole;
      if (!roleId) return;

      const role = member.guild.roles.cache.get(roleId);
      if (!role) return;

      await member.roles.add(roleId);
    } catch (e) {
      console.error("autorole error:", e);
    }
  }
};
