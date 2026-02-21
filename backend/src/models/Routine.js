// src/models/Routine.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Routine = sequelize.define(
  "Routine",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    day: {
      type: DataTypes.ENUM(
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ),
      allowNull: false
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: "start_time"
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      field: "end_time"
    }
  },
  {
    tableName: "routines",
    timestamps: true
  }
);

module.exports = Routine;
