// src/models/Student.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Student = sequelize.define(
  "Student",
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
    rollNo: {
      type: DataTypes.STRING,
      unique: true,
      field: "roll_no"
    },
    className: {
      type: DataTypes.STRING,
      field: "class_name"
    }
  },
  {
    tableName: "students",
    timestamps: true
  }
);

module.exports = Student;
