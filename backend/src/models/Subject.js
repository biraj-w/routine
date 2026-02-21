// src/models/Subject.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Subject = sequelize.define(
  "Subject",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    subjectName: { type: DataTypes.STRING, allowNull: false, field: "subject_name" },
  },
  {
    tableName: "subjects",
    timestamps: true
  }
);

module.exports = Subject;
