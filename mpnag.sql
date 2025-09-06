-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 06, 2025 at 12:40 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `mpnag`
--

-- --------------------------------------------------------

--
-- Table structure for table `disciplinary_cases`
--

CREATE TABLE `disciplinary_cases` (
  `case_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `reported_by` int(11) DEFAULT NULL,
  `case_type` enum('Tardiness','Bullying','Disrespect','Academic Dishonesty','Others') NOT NULL,
  `description` text DEFAULT NULL,
  `date_reported` date NOT NULL,
  `status` enum('Pending','Ongoing','Resolved','Archived') DEFAULT 'Pending',
  `resolution` text DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL,
  `case_id` int(11) NOT NULL,
  `recipient_contact` varchar(20) NOT NULL,
  `message` text NOT NULL,
  `status` enum('Sent','Failed','Pending') DEFAULT 'Pending',
  `sent_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `predictive_data`
--

CREATE TABLE `predictive_data` (
  `record_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `total_cases` int(11) DEFAULT 0,
  `case_frequency` int(11) DEFAULT 0,
  `last_case_date` date DEFAULT NULL,
  `academic_performance` decimal(5,2) DEFAULT NULL,
  `attendance_rate` decimal(5,2) DEFAULT NULL,
  `predicted_risk_level` enum('Low','Medium','High','Unknown') DEFAULT 'Unknown',
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `students`
--

CREATE TABLE `students` (
  `student_id` int(11) NOT NULL,
  `lrn` varchar(20) DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `grade_level` enum('Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12') NOT NULL,
  `strand` enum('ABM','HUMSS','STEM','GAS','TVL','Others') DEFAULT NULL,
  `section` varchar(50) DEFAULT NULL,
  `gender` enum('Male','Female','Prefer not to say') DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `parent_contact` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('Admin','Guidance','Adviser','Teacher') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `disciplinary_cases`
--
ALTER TABLE `disciplinary_cases`
  ADD PRIMARY KEY (`case_id`),
  ADD KEY `student_id` (`student_id`),
  ADD KEY `reported_by` (`reported_by`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notification_id`),
  ADD KEY `case_id` (`case_id`);

--
-- Indexes for table `predictive_data`
--
ALTER TABLE `predictive_data`
  ADD PRIMARY KEY (`record_id`),
  ADD KEY `student_id` (`student_id`);

--
-- Indexes for table `students`
--
ALTER TABLE `students`
  ADD PRIMARY KEY (`student_id`),
  ADD UNIQUE KEY `lrn` (`lrn`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `disciplinary_cases`
--
ALTER TABLE `disciplinary_cases`
  MODIFY `case_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notification_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `predictive_data`
--
ALTER TABLE `predictive_data`
  MODIFY `record_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `students`
--
ALTER TABLE `students`
  MODIFY `student_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `disciplinary_cases`
--
ALTER TABLE `disciplinary_cases`
  ADD CONSTRAINT `disciplinary_cases_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `disciplinary_cases_ibfk_2` FOREIGN KEY (`reported_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`case_id`) REFERENCES `disciplinary_cases` (`case_id`) ON DELETE CASCADE;

--
-- Constraints for table `predictive_data`
--
ALTER TABLE `predictive_data`
  ADD CONSTRAINT `predictive_data_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
