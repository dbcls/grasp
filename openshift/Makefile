.ONESHELL:
SHELL = /bin/bash

.PHONY: all test

test:
	npm ci
	npm install jest-junit
	./node_modules/jest/bin/jest.js --ci --reporters=default --reporters=jest-junit
	mv junit.xml test/test_results.xml

