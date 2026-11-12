-- Runs once when the Postgres container volume is first created.
-- Creates an isolated database for automated tests.
CREATE DATABASE ticketing_test OWNER ticketing;
