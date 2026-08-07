# Keep business decisions in NestJS

NestJS owns business state, workflow transitions, validation, permissions, pricing, and final decisions. AI components return structured proposals that NestJS validates; a Python worker is introduced only for a concrete specialized workload and never writes uncontrolled business decisions.
