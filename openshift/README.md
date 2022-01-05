# the org api files 
- mounted in the pod via configmap and created by Jenkins 
## git clone https://github.com/viaacode/datamodels.git
- cd datamodels/
- oc project metadata-mgm
- cd graphql/organizations-api/
- oc create configmap --from-file=. organizations-api-${env}
