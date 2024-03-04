.ONESHELL:
SHELL = /bin/bash

.PHONY: all test

test:
	npm install
	npm run build
	npm run test
	mv junit.xml test/test_results.xml

