// src/models/Teacher.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Teacher = sequelize.define(
  "Teacher",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    department: {
      type: DataTypes.STRING
    }
  },
  {
    tableName: "teachers",
    timestamps: true
  }
);

module.exports = Teacher;
