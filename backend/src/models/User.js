const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const User = sequelize.define("User", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    // admin, teacher
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "teacher",
  },
});

module.exports = User;
